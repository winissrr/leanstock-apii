const Redlock = require('redlock');
const { redis } = require('../config/redis');

const redlock = new Redlock([redis], {
  driftFactor: 0.01,
  retryCount: 5,
  retryDelay: 100,
  retryJitter: 100
});

module.exports = { redlock };
