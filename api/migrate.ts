import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { runMigrations } from './_server/migrationRunner.js';

function defaultMigrationsDir(): string {
  return fileURLToPath(new URL('./migrations/', import.meta.url));
}

async function main(): Promise<void> {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('MIGRATION_DATABASE_URL이 설정되어 있지 않습니다');
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await runMigrations(client, {
      migrationsDir: process.env.MIGRATIONS_DIR ?? defaultMigrationsDir(),
    });
    console.log(JSON.stringify({ applied: result.applied, skipped: result.skipped }));
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`마이그레이션 실행에 실패했습니다: ${message}`);
  process.exitCode = 1;
});
