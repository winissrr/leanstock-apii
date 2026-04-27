const { prisma } = require('../config/database');
const env = require('../config/env');
const { hashPassword, verifyPassword } = require('../utils/password');
const { createJti, signAccessToken, signRefreshToken, hashToken } = require('../utils/jwt');
const { ApiError } = require('../middleware/errorHandler');
const { redis } = require('../config/redis');
const jwt = require('jsonwebtoken');

const ACCOUNT_LOCK_MINUTES = 15;

function buildUserPayload(user) {
  return {
    sub: user.id,
    tenantId: user.tenantId,
    role: user.role
  };
}

async function persistRefreshToken(userId, refreshToken, expiresAt) {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt
    }
  });
  return tokenHash;
}

async function createAuthPair(user) {
  const accessToken = signAccessToken({
    ...buildUserPayload(user),
    jti: createJti()
  });

  const refreshToken = signRefreshToken({
    ...buildUserPayload(user),
    jti: createJti()
  });

  const decoded = jwt.decode(refreshToken);
  await persistRefreshToken(user.id, refreshToken, new Date(decoded.exp * 1000));

  return { accessToken, refreshToken };
}

async function registerUser(input) {
  const { tenantName, tenantSlug, firstName, lastName, email, password, role } = input;

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: {},
    create: { name: tenantName, slug: tenantSlug }
  });

  const existing = await prisma.user.findUnique({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email
      }
    }
  });

  if (existing) {
    throw new ApiError(409, 'Conflict', 'Email already exists within this tenant');
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      passwordHash,
      role: role || 'ADMIN',
      firstName,
      lastName
    }
  });

  const auth = await createAuthPair(user);

  return { user, ...auth };
}

async function loginUser({ tenantSlug, email, password, ipAddress }) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug }
  });

  if (!tenant || tenant.deletedAt) {
    throw new ApiError(401, 'Unauthorized', 'Invalid credentials');
  }

  const user = await prisma.user.findUnique({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email
      }
    }
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new ApiError(401, 'Unauthorized', 'Invalid credentials');
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, 'Locked', 'Account temporarily locked');
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const attempts = user.loginAttempts + 1;
    const shouldLock = attempts >= 5;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000) : null
      }
    });
    throw new ApiError(401, 'Unauthorized', 'Invalid credentials');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      loginAttempts: 0,
      lockedUntil: null
    }
  });

  const auth = await createAuthPair(user);

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      userId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      newValue: { at: new Date().toISOString() },
      ipAddress: ipAddress || null
    }
  });

  return { user, ...auth };
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new ApiError(401, 'Unauthorized', 'Missing refresh token');
  }

  const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  const tokenHash = hashToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new ApiError(403, 'Forbidden', 'Refresh token revoked or expired');
  }

  if (!stored.user.isActive || stored.user.deletedAt) {
    throw new ApiError(403, 'Forbidden', 'User inactive');
  }

  return {
    accessToken: signAccessToken({
      sub: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
      jti: createJti()
    })
  };
}

async function logout({ accessToken, refreshToken }) {
  if (accessToken) {
    const decoded = jwt.decode(accessToken);
    if (decoded?.jti && decoded?.exp) {
      const ttlSeconds = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
      await redis.set(`blacklist:${decoded.jti}`, '1', 'EX', ttlSeconds);
    }
  }

  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  return { ok: true };
}

async function getCurrentUser(userId) {
  return prisma.user.findUnique({
    where: { id: userId }
  });
}

module.exports = {
  registerUser,
  loginUser,
  refreshAccessToken,
  logout,
  getCurrentUser
};
