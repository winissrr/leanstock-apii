const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function createJti() {
  return crypto.randomUUID();
}

function signAccessToken(payload) {
  const jti = payload.jti || createJti();
  const data = { ...payload, jti };
  return jwt.sign(data, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL
  });
}

function signRefreshToken(payload) {
  const jti = payload.jti || createJti();
  const data = { ...payload, jti };
  return jwt.sign(data, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_TTL
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  createJti,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken
};
