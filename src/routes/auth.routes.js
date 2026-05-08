const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { loginRateLimiter, registerRateLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/authController');

const router = Router();

router.post('/register', registerRateLimiter, asyncHandler(ctrl.register));
router.get('/verify-email', asyncHandler(ctrl.verifyEmail));
router.post('/login', loginRateLimiter, asyncHandler(ctrl.login));
router.post('/refresh', asyncHandler(ctrl.refresh));
router.post('/forgot-password', loginRateLimiter, asyncHandler(ctrl.forgotPassword));
router.post('/reset-password', asyncHandler(ctrl.resetPassword));
router.post('/logout', authenticate, asyncHandler(ctrl.logout));
router.get('/me', authenticate, asyncHandler(ctrl.me));

module.exports = router;
