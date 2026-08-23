import { execFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

it('starts the actual local worker entrypoint and shuts down cleanly', async () => {
  const entrypointUrl = pathToFileURL(
    path.resolve(process.cwd(), 'scripts/local-notification-worker.ts'),
  ).href;
  const evaluation = [
    "setTimeout(() => process.emit('SIGTERM', 'SIGTERM'), 250);",
    `await import(${JSON.stringify(entrypointUrl)});`,
  ].join('\n');

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--import', 'tsx', '--eval', evaluation],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_URL: 'data:text/plain,local-worker-startup-test',
        SCHEDULER_SECRET: 'local-worker-test-secret',
      },
      timeout: 5_000,
    },
  );

  expect(stdout).toContain('[notification-worker]');
  expect(stdout).toContain('application unavailable');
  expect(stderr).toBe('');
}, 10_000);
