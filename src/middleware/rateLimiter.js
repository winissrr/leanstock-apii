const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const make = (max) => rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    type: 'https://leanstock.io/errors/429',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Rate limit exceeded. Please try again later.',
  },
});

module.exports = {
  loginLimiter: make(env.RATE_LIMIT_LOGIN_MAX),
  registerLimiter: make(env.RATE_LIMIT_REGISTER_MAX),
  generalLimiter: make(100),
};
