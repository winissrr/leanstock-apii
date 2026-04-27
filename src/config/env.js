const dotenv = require('dotenv');
const { z } = require('zod');

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().min(1, 'Required'),
  REDIS_URL: z.string().min(1, 'Required'),
  JWT_SECRET: z.string().min(32, 'String must contain at least 32 character(s)'),
  JWT_REFRESH_SECRET: z.string().min(32, 'String must contain at least 32 character(s)'),
  CORS_ORIGIN: z.string().min(1, 'Required'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(1).default(10),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment configuration:\n${formatted}`);
}

module.exports = parsed.data;