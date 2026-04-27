const Redis = require('ioredis');

let redis;

if (process.env.NODE_ENV === 'test') {
  redis = {
    set: async () => {},
    get: async () => null,
    del: async () => {},
    quit: async () => {},
    incr: async () => 1,
    expire: async () => {},
  };
} else {
  redis = new Redis(process.env.REDIS_URL);

  redis.on('error', (err) => {
    console.error('Redis error:', err.message);
  });
}

module.exports = { redis };