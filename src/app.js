
// Load & validate environment first — app refuses to start on missing secrets
const env = require('./config/env');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const YAML = require('js-yaml');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');

const { errorHandler } = require('./middleware/errorHandler');
const { generalApiLimiter } = require('./middleware/rateLimiter');
const { startDecayCron } = require('./jobs/decayCron');
const prisma = require('./config/database');

// ─── Routes ───────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const locationRoutes = require('./routes/location.routes');
const transactionRoutes = require('./routes/transaction.routes');
const alertRoutes = require('./routes/alert.routes');
const reportRoutes = require('./routes/report.routes');

// ─── App ──────────────────────────────────────────────────────────────────
const app = express();

// Security headers
app.use(helmet());

// CORS — no wildcards in production
app.use(cors({
  origin: env.NODE_ENV === 'production'
    ? env.CORS_ORIGIN.split(',').map((s) => s.trim())
    : true,
  credentials: true,
}));

// HTTP request logger
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Global rate limiter on all API routes
app.use('/api', generalApiLimiter);

// ─── Swagger UI ───────────────────────────────────────────────────────────
const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  const openapiDoc = YAML.load(fs.readFileSync(openapiPath, 'utf8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc, {
    customSiteTitle: 'LeanStock API',
  }));
}

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    return res.status(503).json({ status: 'degraded', error: 'Database unreachable' });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);

// ─── 404 handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    type: 'https://leanstock.io/errors/not-found',
    title: 'Not Found',
    status: 404,
    detail: `Cannot ${req.method} ${req.path}`,
  });
});

// ─── Global error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

// ─── Server bootstrap ─────────────────────────────────────────────────────
async function start() {
  try {
    await prisma.$connect();
    console.log('[LeanStock] Database connected.');
  } catch (err) {
    console.error('[LeanStock] Database connection failed:', err.message);
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    console.log(`[LeanStock] Server running on port ${env.PORT} (${env.NODE_ENV})`);
    console.log(`[LeanStock] API docs: http://localhost:${env.PORT}/docs`);
  });

  // Start cron jobs
  if (env.NODE_ENV !== 'test') {
    startDecayCron();
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('[LeanStock] SIGTERM received — shutting down gracefully...');
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });

  return server;
}

// Only start server when run directly, not when required (e.g. in tests)
if (require.main === module) {
  start();
}

module.exports = app;
