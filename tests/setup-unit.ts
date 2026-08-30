import '@testing-library/jest-dom/vitest';

process.env.DATABASE_URL ??= 'postgresql://localhost/remindly_test';
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
