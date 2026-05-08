const { RateLimiterRedis } = require('rate-limiter-flexible');
const { getRedisClient } = require('../utils/redisClient');
const env = require('../config/env');

function createRateLimiter({ keyPrefix, points, duration, keyFn }) {
  let limiter;

  function getLimiter() {
    if (!limiter) {
      limiter = new RateLimiterRedis({
        storeClient: getRedisClient(),
        keyPrefix,
        points,
        duration,
        insuranceLimiter: undefined,
      });
    }
    return limiter;
  }

  return async (req, res, next) => {
    const key = keyFn ? keyFn(req) : (req.ip || 'unknown');
    try {
      await getLimiter().consume(key);
      next();
    } catch (rlRes) {
      if (rlRes && rlRes.msBeforeNext !== undefined) {
        res.set('Retry-After', String(Math.ceil(rlRes.msBeforeNext / 1000)));
        return res.status(429).json({
          type: 'https://leanstock.io/errors/rate-limit',
          title: 'Too Many Requests',
          status: 429,
          detail: `Rate limit exceeded. Retry after ${Math.ceil(rlRes.msBeforeNext / 1000)}s.`,
        });
      }
      next();
    }
  };
}

const loginRateLimiter = createRateLimiter({
  keyPrefix: 'rl:login',
  points: env.RATE_LIMIT_LOGIN_MAX,
  duration: env.RATE_LIMIT_WINDOW_SECONDS,
});

const registerRateLimiter = createRateLimiter({
  keyPrefix: 'rl:register',
  points: env.RATE_LIMIT_REGISTER_MAX,
  duration: env.RATE_LIMIT_WINDOW_SECONDS,
});

const generalApiLimiter = createRateLimiter({
  keyPrefix: 'rl:api',
  points: 200,
  duration: 60,
});

module.exports = { createRateLimiter, loginRateLimiter, registerRateLimiter, generalApiLimiter };