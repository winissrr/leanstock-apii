const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../config/database');
const env = require('../config/env');
const { getRedisClient } = require('../utils/redisClient');
const { createError } = require('../middleware/errorHandler');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
} = require('./emailService');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.REFRESH_TOKEN_TTL },
  );
}

async function register({ email, password, firstName, lastName, tenantSlug, tenantName }) {
  let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: { name: tenantName || tenantSlug, slug: tenantSlug },
    });
  }

  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (existing) {
    throw createError(409, 'An account with this email already exists.', {
      code: 'email-exists',
      title: 'Conflict',
    });
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  const verifyToken = generateOpaqueToken();
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); 
  const userCount = await prisma.user.count({ where: { tenantId: tenant.id } });
  const role = userCount === 0 ? 'ADMIN' : 'STAFF';

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash,
      firstName,
      lastName,
      role,
      verifyToken: hashToken(verifyToken),
      verifyExpires,
    },
  });

  sendVerificationEmail({ to: email, firstName, token: verifyToken }).catch((err) =>
    console.error('[emailService] Failed to send verification email:', err.message),
  );

  return { user: sanitizeUser(user), tenant };
}

async function verifyEmail(token) {
  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: {
      verifyToken: tokenHash,
      verifyExpires: { gt: new Date() },
      isVerified: false,
    },
  });
  if (!user) {
    throw createError(400, 'Invalid or expired verification token.', {
      code: 'invalid-token',
      title: 'Bad Request',
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isVerified: true,
      verifyToken: null,
      verifyExpires: null,
    },
  });

  return { message: 'Email verified successfully. You may now log in.' };
}

async function login({ email, password, tenantSlug }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || !tenant.isActive) {
    throw createError(401, 'Invalid credentials.', { code: 'invalid-credentials', title: 'Unauthorized' });
  }

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });

  if (!user || !user.isActive) {
    throw createError(401, 'Invalid credentials.', { code: 'invalid-credentials', title: 'Unauthorized' });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfter = Math.ceil((user.lockedUntil - Date.now()) / 1000);
    throw createError(
      423,
      `Account locked. Try again in ${retryAfter} seconds.`,
      { code: 'account-locked', title: 'Locked' },
    );
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) {
    const attempts = user.loginAttempts + 1;
    const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: attempts, lockedUntil: lockUntil },
    });
    throw createError(401, 'Invalid credentials.', { code: 'invalid-credentials', title: 'Unauthorized' });
  }

  if (!user.isVerified) {
    throw createError(403, 'Please verify your email before logging in.', {
      code: 'email-not-verified',
      title: 'Forbidden',
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { loginAttempts: 0, lockedUntil: null },
  });

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);

  const refreshTTL = parseTTLtoMs(env.REFRESH_TOKEN_TTL);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshTTL),
    },
  });

  return { accessToken, refreshToken, user: sanitizeUser(user) };
}

async function refreshTokens(rawRefreshToken) {
  let payload;
  try {
    payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw createError(401, 'Invalid or expired refresh token.', {
      code: 'invalid-token',
      title: 'Unauthorized',
    });
  }

  const tokenHash = hashToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.expiresAt < new Date()) {
    throw createError(401, 'Refresh token not found or expired.', {
      code: 'invalid-token',
      title: 'Unauthorized',
    });
  }

  await prisma.refreshToken.delete({ where: { tokenHash } });

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) {
    throw createError(401, 'User not found.', { code: 'user-not-found', title: 'Unauthorized' });
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = signRefreshToken(user);
  const refreshTTL = parseTTLtoMs(env.REFRESH_TOKEN_TTL);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + refreshTTL),
    },
  });

  return { accessToken, refreshToken: newRefreshToken };
}

async function logout({ accessToken, refreshToken }) {
  try {
    const payload = jwt.decode(accessToken);
    if (payload && payload.exp) {
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        const redis = getRedisClient();
        await redis.set(`bl:${accessToken}`, '1', 'EX', ttl);
      }
    }
  } catch { }
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
}

async function forgotPassword({ email, tenantSlug }) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant) return { message: 'If that email exists, a reset link has been sent.' };

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (!user || !user.isActive) {
    return { message: 'If that email exists, a reset link has been sent.' };
  }

  const resetToken = generateOpaqueToken();
  const resetExpires = new Date(Date.now() + 60 * 60 * 1000); 

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: hashToken(resetToken), resetExpires },
  });

  sendPasswordResetEmail({ to: email, firstName: user.firstName, token: resetToken }).catch(
    (err) => console.error('[emailService] Failed to send reset email:', err.message),
  );

  return { message: 'If that email exists, a reset link has been sent.' };
}

async function resetPassword({ token, newPassword }) {
  const tokenHash = hashToken(token);
  const user = await prisma.user.findFirst({
    where: { resetToken: tokenHash, resetExpires: { gt: new Date() } },
  });
  if (!user) {
    throw createError(400, 'Invalid or expired reset token.', {
      code: 'invalid-token',
      title: 'Bad Request',
    });
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetExpires: null, loginAttempts: 0, lockedUntil: null },
  });

  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

  return { message: 'Password reset successfully. Please log in.' };
}

function sanitizeUser(user) {
  const { passwordHash, verifyToken, verifyExpires, resetToken, resetExpires, ...safe } = user;
  return safe;
}

function parseTTLtoMs(ttl) {
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = String(ttl).match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400000;
  return parseInt(match[1], 10) * units[match[2]];
}

module.exports = {
  register,
  verifyEmail,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  resetPassword,
};
