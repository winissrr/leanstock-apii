const cron = require('node-cron');
const env = require('../config/env');
const { applyDecay } = require('../services/decayService');

function startDecayCron() {
  console.log(`[Cron] Decay job scheduled: "${env.DECAY_CRON}"`);
  cron.schedule(env.DECAY_CRON, async () => {
    console.log('[Cron] Running decay job at', new Date().toISOString());
    try {
      const count = await applyDecay();
      console.log(`[Cron] Decay complete. Items processed: ${count}`);
    } catch (err) {
      console.error('[Cron] Decay job failed:', err.message);
    }
  }, { timezone: 'UTC' });
}

module.exports = { startDecayCron };
