const { z } = require('zod');
const authService = require('../services/authService');

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tenantSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  tenantName: z.string().min(1).max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
  tenantSlug: z.string().min(1),
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

async function register(req, res) {
  const body = registerSchema.parse(req.body);
  const result = await authService.register(body);
  return res.status(201).json({
    message: 'Registration successful. Please check your email to verify your account.',
    userId: result.user.id,
    tenantId: result.tenant.id,
  });
}

async function verifyEmail(req, res) {
  const token = z.string().min(1).parse(req.query.token);
  const result = await authService.verifyEmail(token);
  return res.status(200).json(result);
}

async function login(req, res) {
  const body = loginSchema.parse(req.body);
  const result = await authService.login(body);
  return res.status(200).json({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
  });
}

async function refresh(req, res) {
  const { refreshToken } = refreshSchema.parse(req.body);
  const result = await authService.refreshTokens(refreshToken);
  return res.status(200).json(result);
}

async function logout(req, res) {
  const accessToken = req.headers.authorization?.slice(7);
  const { refreshToken } = req.body;
  await authService.logout({ accessToken, refreshToken });
  return res.status(200).json({ message: 'Logged out successfully.' });
}

async function forgotPassword(req, res) {
  const body = forgotSchema.parse(req.body);
  const result = await authService.forgotPassword(body);
  return res.status(200).json(result);
}

async function resetPassword(req, res) {
  const body = resetSchema.parse(req.body);
  const result = await authService.resetPassword(body);
  return res.status(200).json(result);
}

async function me(req, res) {
  return res.status(200).json({ user: req.user });
}

module.exports = { register, verifyEmail, login, refresh, logout, forgotPassword, resetPassword, me };
