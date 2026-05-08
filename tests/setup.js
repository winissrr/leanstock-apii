process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leanstock_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-access-secret-must-be-at-least-32-chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-must-be-at-least-32-chars';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.BCRYPT_SALT_ROUNDS = '4'; 
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL = '7d';
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '25';
process.env.SMTP_USER = '';
process.env.SMTP_PASS = '';
process.env.EMAIL_FROM = 'test@leanstock.io';
process.env.APP_URL = 'http://localhost:8000';
process.env.DECAY_CRON = '0 2 * * *';
process.env.RATE_LIMIT_LOGIN_MAX = '100';
process.env.RATE_LIMIT_REGISTER_MAX = '100';
process.env.RATE_LIMIT_WINDOW_SECONDS = '60';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
  }),
}));

jest.mock('ioredis', () => {
  const store = new Map();
  class MockRedis {
    async get(key) { return store.get(key) ?? null; }
    async set(key, val) { store.set(key, val); return 'OK'; }
    async del(key) { store.delete(key); return 1; }
    on() { return this; }
    async quit() {}
  }
  return MockRedis;
});
