const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const locationRoutes = require('./routes/location.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const reportRoutes = require('./routes/report.routes');
const alertRoutes = require('./routes/alert.routes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'));
  },
  credentials: true
}));

const openapiPath = path.join(process.cwd(), 'openapi.yaml');
if (fs.existsSync(openapiPath)) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.load(openapiPath)));
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/auth', authRoutes);
app.use('/products', productRoutes);
app.use('/locations', locationRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/reports', reportRoutes);
app.use('/alerts', alertRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
