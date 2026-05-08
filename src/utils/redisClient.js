const Redis = require('ioredis');
const env = require('../config/env');

let client;

function getRedisClient() {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
      enableOfflineQueue: false,
    });

    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    client.on('connect', () => {
      if (env.NODE_ENV !== 'test') {
        console.log('[Redis] Connected');
      }
    });
  }
  return client;
}

async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}

module.exports = { getRedisClient, closeRedis };
