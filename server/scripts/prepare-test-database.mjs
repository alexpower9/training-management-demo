import { getTestEnvironment, resetTestDatabase } from './test-database.mjs';

try {
  resetTestDatabase(getTestEnvironment());
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
