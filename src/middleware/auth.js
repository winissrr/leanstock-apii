const jwt = require('jsonwebtoken');
const env = require('../config/env');
const redis = require('../utils/redisClient');

const createError = (status, message) => {
  const err = new Error(message);
  err.status = status;
  err.isOperational = true;
  return err;
};

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(createError(401, 'Authorization token required'));
    }
    const token = authHeader.split(' ')[1];

    const blacklisted = await redis.get(`bl:${token}`);
    if (blacklisted) return next(createError(401, 'Token has been revoked'));

    const payload = jwt.verify(token, env.JWT_SECRET);
    req.user = payload;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(createError(401, 'Token expired'));
    if (err.name === 'JsonWebTokenError') return next(createError(401, 'Invalid token'));
    next(err);
  }
};
