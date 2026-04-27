const { verifyAccessToken } = require('../utils/jwt');
const { redis } = require('../config/redis');
const { ApiError } = require('./errorHandler');

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');
  return token || null;
}

async function authenticate(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new ApiError(401, 'Unauthorized', 'Missing bearer token');

    const payload = verifyAccessToken(token);
    if (!payload?.jti) throw new ApiError(401, 'Unauthorized', 'Invalid token payload');

    const blacklisted = await redis.get(`blacklist:${payload.jti}`);
    if (blacklisted) throw new ApiError(401, 'Unauthorized', 'Token revoked');

    req.user = {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      jti: payload.jti
    };
    req.accessToken = token;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Unauthorized', 'Token expired'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new ApiError(401, 'Unauthorized', 'Invalid token'));
    }
    next(err);
  }
}

module.exports = { authenticate };
