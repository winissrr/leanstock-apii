const authService = require('../services/authService');
const asyncHandler = require('../utils/asyncHandler');
const { z } = require('zod');

const createError = (status, msg) => { const e = new Error(msg); e.status = status; e.isOperational = true; return e; };

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase').regex(/[0-9]/, 'Must contain digit'),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  tenantName: z.string().min(1),
});

exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  const result = await authService.register(data);
  res.status(201).json(result);
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) throw createError(400, 'Verification token required');
  const result = await authService.verifyEmail(token);
  res.json(result);
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const result = await authService.login({ email, password });
  res.json(result);
});

exports.refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw createError(400, 'refreshToken required');
  const result = await authService.refreshTokens(refreshToken);
  res.json(result);
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.token, req.user.sub);
  res.json({ message: 'Logged out successfully' });
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  await authService.forgotPassword(email);
  res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = z.object({
    token: z.string(),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  }).parse(req.body);
  await authService.resetPassword(token, password);
  res.json({ message: 'Password reset successful. You can now log in.' });
});

exports.inviteStaff = asyncHandler(async (req, res) => {
  const { email, role } = z.object({ email: z.string().email(), role: z.enum(['STAFF', 'MANAGER']).default('STAFF') }).parse(req.body);
  const result = await authService.inviteStaff({ email, role, tenantId: req.tenantId, invitedById: req.user.sub });
  res.status(201).json(result);
});

exports.acceptInvite = asyncHandler(async (req, res) => {
  const data = z.object({
    token: z.string(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  }).parse(req.body);
  const result = await authService.acceptInvite(data);
  res.json(result);
});
