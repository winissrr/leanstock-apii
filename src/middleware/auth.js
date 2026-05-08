
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { getRedisClient } = require('../utils/redisClient');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      type: 'https://leanstock.io/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail: 'Missing or malformed Authorization header.',
    });
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    const detail =
      err.name === 'TokenExpiredError'
        ? 'Access token has expired.'
        : 'Invalid access token.';
    return res.status(401).json({
      type: 'https://leanstock.io/errors/unauthorized',
      title: 'Unauthorized',
      status: 401,
      detail,
    });
  }

  try {
    const redis = getRedisClient();
    const blacklisted = await redis.get(`bl:${token}`);
    if (blacklisted) {
      return res.status(401).json({
        type: 'https://leanstock.io/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
        detail: 'Token has been revoked.',
      });
    }
  } catch {
    if (env.NODE_ENV === 'production') {
      return res.status(503).json({
        type: 'https://leanstock.io/errors/service-unavailable',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Auth service temporarily unavailable.',
      });
    }
  }

  req.user = {
    id: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    email: payload.email,
  };

  next();
}

module.exports = { authenticate };
