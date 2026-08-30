import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Prisma CLI needs a direct/session connection for migrations. Runtime
    // application traffic continues to use DATABASE_URL in src/server/db/client.ts.
    url: env('DIRECT_URL'),
  },
});
