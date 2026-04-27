const { default: Redlock } = require('redlock');
const { redis } = require('../config/redis');

let redlock;

if (process.env.NODE_ENV === 'test') {
  redlock = {
    acquire: async () => ({ release: async () => {} })
  };
} else {
  redlock = new Redlock([redis], {
    driftFactor: 0.01,
    retryCount: 5,
    retryDelay: 100,
    retryJitter: 100
  });
}

module.exports = { redlock };