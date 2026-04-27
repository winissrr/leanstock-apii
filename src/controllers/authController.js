const asyncHandler = require('../utils/asyncHandler');
const { registerUser, loginUser, refreshAccessToken, logout, getCurrentUser } = require('../services/authService');
const { ApiError } = require('../middleware/errorHandler');

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production'
};

const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);
  res.cookie('refreshToken', result.refreshToken, cookieOptions);
  res.status(201).json({
    user: sanitizeUser(result.user),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken
  });
});

const login = asyncHandler(async (req, res) => {
  const result = await loginUser({
    ...req.body,
    ipAddress: req.ip
  });
  res.cookie('refreshToken', result.refreshToken, cookieOptions);
  res.json({
    user: sanitizeUser(result.user),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken
  });
});

const refresh = asyncHandler(async (req, res) => {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  const result = await refreshAccessToken(token);
  res.json(result);
});

const logoutController = asyncHandler(async (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
  await logout({
    accessToken: req.accessToken || req.headers.authorization?.split(' ')[1],
    refreshToken
  });
  res.clearCookie('refreshToken', cookieOptions);
  res.json({ message: 'Logged out' });
});

const me = asyncHandler(async (req, res) => {
  const user = await getCurrentUser(req.user.id);
  if (!user) throw new ApiError(404, 'Not Found', 'User not found');
  res.json({ user: sanitizeUser(user) });
});

function sanitizeUser(user) {
  const { passwordHash, loginAttempts, lockedUntil, deletedAt, ...safe } = user;
  return safe;
}

module.exports = { register, login, refresh, logoutController, me, sanitizeUser };
