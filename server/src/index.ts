import { buildApp } from './app.js';
import { config, ensureDatabaseUrl, validateProductionConfig } from './config.js';
import { disconnectDatabase, getPrisma } from './database.js';

async function start() {
  validateProductionConfig();
  await ensureDatabaseUrl();
  await getPrisma();

  const app = await buildApp();

  const shutdown = async () => {
    await app.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
