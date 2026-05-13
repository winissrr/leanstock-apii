const env = require('./config/env');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

const authRoutes        = require('./routes/auth.routes');
const productRoutes     = require('./routes/product.routes');
const inventoryRoutes   = require('./routes/inventory.routes');
const locationRoutes    = require('./routes/location.routes');
const transactionRoutes = require('./routes/transaction.routes');
const alertRoutes       = require('./routes/alert.routes');
const reportRoutes      = require('./routes/report.routes');

const { startDecayCron } = require('./jobs/decayCron');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(generalLimiter);

const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  const spec = yaml.load(fs.readFileSync(openapiPath, 'utf8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'LeanStock API' }));
}

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/auth',         authRoutes);
app.use('/products',     productRoutes);
app.use('/inventory',    inventoryRoutes);
app.use('/locations',    locationRoutes);
app.use('/transactions', transactionRoutes);
app.use('/alerts',       alertRoutes);
app.use('/reports',      reportRoutes);

app.use((req, res) => res.status(404).json({ type: 'https://leanstock.io/errors/404', title: 'Not Found', status: 404, detail: `Route ${req.method} ${req.path} not found` }));

app.use(errorHandler);

app.use((err, req, res, next) => {
  if (err.name === 'ZodError') {
    return res.status(422).json({ type: 'https://leanstock.io/errors/422', title: 'Validation Error', status: 422, errors: err.errors });
  }
  next(err);
});

if (require.main === module) {
  app.listen(env.PORT, () => {
    console.log(`🚀 LeanStock API running on http://localhost:${env.PORT}`);
    console.log(`📚 Swagger docs at http://localhost:${env.PORT}/docs`);
    startDecayCron();
  });
}

module.exports = app;
