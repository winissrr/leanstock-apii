const router = require('express').Router();
const { z } = require('zod');
const { register, login, refresh, logoutController, me } = require('../controllers/authController');
const validate = require('../middleware/validate');
const { createRateLimiter } = require('../middleware/rateLimiter');
const { authenticate } = require('../middleware/auth');
const env = require('../config/env');

const passwordRules = z.string().min(8).regex(/[A-Z]/, 'Must include an uppercase letter').regex(/[0-9]/, 'Must include a digit');

const registerSchema = z.object({
  tenantName: z.string().min(2),
  tenantSlug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: passwordRules,
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF']).default('ADMIN')
});

const loginSchema = z.object({
  tenantSlug: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional()
});

router.post('/register', createRateLimiter({
  limit: env.RATE_LIMIT_REGISTER_MAX,
  windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
  keyPrefix: 'rl:auth:register'
}), validate(registerSchema), register);

router.post('/login', createRateLimiter({
  limit: env.RATE_LIMIT_LOGIN_MAX,
  windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
  keyPrefix: 'rl:auth:login'
}), validate(loginSchema), login);

router.post('/refresh', validate(refreshSchema), refresh);
router.post('/logout', authenticate, validate(logoutSchema), logoutController);
router.get('/me', authenticate, me);

module.exports = router;
