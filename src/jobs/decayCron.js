const cron = require('node-cron');
const env = require('../config/env');
const { runDecayCycle } = require('../services/decayService');

function startDecayCron() {
  return cron.schedule(env.DECAY_CRON, async () => {
    try {
      await runDecayCycle();
      console.log('[cron] decay cycle completed');
    } catch (err) {
      console.error('[cron] decay cycle failed', err);
    }
  }, { timezone: 'UTC' });
}

module.exports = { startDecayCron };
