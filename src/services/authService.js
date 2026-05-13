const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const prisma = require('../config/database');
const env = require('../config/env');
const redis = require('../utils/redisClient');
const emailService = require('./emailService');

const createError = (status, msg) => { const e = new Error(msg); e.status = status; e.isOperational = true; return e; };

function signAccess(payload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}
function signRefresh(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_TOKEN_TTL });
}

async function register({ email, password, firstName, lastName, tenantName }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: tenantName.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now(),
      users: {
        create: {
          email,
          passwordHash,
          role: 'ADMIN',
          firstName,
          lastName,
          emailVerifyToken: verifyToken,
          emailVerifyExpires: verifyExpires,
        },
      },
    },
    include: { users: true },
  });

  const user = tenant.users[0];
  emailService.sendVerificationEmail(email, verifyToken).catch(console.error);

  return { message: 'Registration successful. Please check your email to verify your account.', userId: user.id };
}

async function verifyEmail(token) {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token, emailVerifyExpires: { gt: new Date() } },
  });
  if (!user) throw createError(400, 'Invalid or expired verification token');

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
  });
  return { message: 'Email verified successfully. You can now log in.' };
}

async function login({ email, password }) {
  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: { tenant: true },
  });
  if (!user) throw createError(401, 'Invalid email or password');

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw createError(423, `Account locked. Try again in ${mins} minute(s).`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.loginAttempts + 1;
    const updateData = { loginAttempts: attempts };
    if (attempts >= env.RATE_LIMIT_LOGIN_MAX) {
      updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
    await prisma.user.update({ where: { id: user.id }, data: updateData });
    throw createError(401, 'Invalid email or password');
  }

  if (!user.emailVerified) throw createError(403, 'Please verify your email before logging in.');
  if (!user.isActive) throw createError(403, 'Account suspended. Contact your administrator.');

  await prisma.user.update({ where: { id: user.id }, data: { loginAttempts: 0, lockedUntil: null } });

  const payload = { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
  const accessToken = signAccess(payload);
  const refreshToken = signRefresh({ sub: user.id });

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName } };
}

async function refreshTokens(rawRefreshToken) {
  let payload;
  try {
    payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw createError(401, 'Invalid refresh token');
  }

  const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.expiresAt < new Date()) throw createError(401, 'Refresh token expired or revoked');

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || !user.isActive) throw createError(401, 'User no longer active');

  await prisma.refreshToken.delete({ where: { tokenHash } });
  const newPayload = { sub: user.id, tenantId: user.tenantId, role: user.role, email: user.email };
  const accessToken = signAccess(newPayload);
  const newRefresh = signRefresh({ sub: user.id });
  const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: newHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  });

  return { accessToken, refreshToken: newRefresh };
}

async function logout(accessToken, userId) {
  await redis.set(`bl:${accessToken}`, '1', 'EX', 900);
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

async function forgotPassword(email) {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user) return; 
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: token, passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000) },
  });
  emailService.sendPasswordResetEmail(email, token).catch(console.error);
}

async function resetPassword(token, newPassword) {
  const user = await prisma.user.findFirst({
    where: { passwordResetToken: token, passwordResetExpires: { gt: new Date() } },
  });
  if (!user) throw createError(400, 'Invalid or expired reset token');
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, passwordResetToken: null, passwordResetExpires: null, loginAttempts: 0, lockedUntil: null },
  });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
}

async function inviteStaff({ email, role = 'STAFF', tenantId, invitedById }) {
  const inviter = await prisma.user.findUnique({ where: { id: invitedById } });
  const token = crypto.randomBytes(32).toString('hex');
  const existing = await prisma.user.findFirst({ where: { email, tenantId } });
  if (existing) throw createError(409, 'User with this email already exists in your tenant');

  await prisma.user.create({
    data: {
      tenantId, email, passwordHash: '', role,
      firstName: '', lastName: '',
      emailVerifyToken: token, emailVerifyExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  emailService.sendStaffInviteEmail(email, token, `${inviter.firstName} ${inviter.lastName}`).catch(console.error);
  return { message: 'Invitation sent' };
}

async function acceptInvite({ token, firstName, lastName, password }) {
  const user = await prisma.user.findFirst({
    where: { emailVerifyToken: token, emailVerifyExpires: { gt: new Date() } },
  });
  if (!user) throw createError(400, 'Invalid or expired invitation token');
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { firstName, lastName, passwordHash, emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
  });
  return { message: 'Account activated. You can now log in.' };
}

module.exports = { register, verifyEmail, login, refreshTokens, logout, forgotPassword, resetPassword, inviteStaff, acceptInvite };
