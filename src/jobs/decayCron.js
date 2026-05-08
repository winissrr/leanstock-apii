const cron = require('node-cron');
const env = require('../config/env');
const { runDecay } = require('../services/decayService');

let task;

function startDecayCron() {
  if (task) return task; 

  const cronExpr = env.DECAY_CRON || '0 2 * * *';

  if (!cron.validate(cronExpr)) {
    console.error(`[decayCron] Invalid cron expression: "${cronExpr}". Job not scheduled.`);
    return null;
  }

  task = cron.schedule(cronExpr, async () => {
    const start = Date.now();
    console.log(`[decayCron] Starting decay run at ${new Date().toISOString()}`);
    try {
      const stats = await runDecay();
      const elapsed = Date.now() - start;
      console.log(`[decayCron] Completed in ${elapsed}ms — processed: ${stats.processed}, skipped: ${stats.skipped}, errors: ${stats.errors}`);
    } catch (err) {
      console.error('[decayCron] Fatal error during decay run:', err.message);
    }
  }, {
    timezone: 'UTC',
  });

  console.log(`[decayCron] Decay job scheduled: ${cronExpr} (UTC)`);
  return task;
}

function stopDecayCron() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { startDecayCron, stopDecayCron };
