import '@testing-library/jest-dom/vitest';

import { assertTestDatabaseUrl } from '@/server/db/test-database';

assertTestDatabaseUrl(process.env.DATABASE_URL ?? '');
