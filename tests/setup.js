process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = "postgresql://postgres:Iwtbhpl1.1@localhost:5432/leanstock";
process.env.REDIS_URL = "redis://localhost:6379";

process.env.JWT_SECRET = "12345678901234567890123456789012";
process.env.JWT_REFRESH_SECRET = "abcdefghijklmnopqrstuvwxyz123456";

process.env.CORS_ORIGIN = "http://localhost";
process.env.BCRYPT_SALT_ROUNDS = "10"; 
process.env.ACCESS_TOKEN_TTL = "15m";
process.env.REFRESH_TOKEN_TTL = "7d";