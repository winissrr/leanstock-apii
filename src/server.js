const app = require('./app');
const env = require('./config/env');
const { prisma } = require('./config/database');
const { startDecayCron } = require('./jobs/decayCron');

async function main() {
  const server = app.listen(env.PORT, () => {
    console.log(`LeanStock API listening on port ${env.PORT}`);
  });

  startDecayCron();

  const shutdown = async () => {
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
