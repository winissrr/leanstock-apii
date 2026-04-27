const { redis } = require('../config/redis');
const { ApiError } = require('./errorHandler');

function createRateLimiter({ limit, windowSeconds, keyPrefix }) {
  return async (req, res, next) => {
    try {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const key = `${keyPrefix}:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (count > limit) {
        return next(new ApiError(429, 'Too Many Requests', 'Rate limit exceeded'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { createRateLimiter };
