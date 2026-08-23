import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

type WorkerProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
};

function runWorkerUntilFirstOutput(cwd: string): Promise<WorkerProcessResult> {
  const environment = { ...process.env };
  for (const key of ['APP_URL', 'SCHEDULER_SECRET', 'NODE_ENV', '__NEXT_PROCESSED_ENV']) {
    delete environment[key];
  }

  const child = spawn(
    process.execPath,
    [
      '--import',
      import.meta.resolve('tsx'),
      path.resolve(process.cwd(), 'scripts/local-notification-worker.ts'),
    ],
    {
      cwd,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );

  return new Promise((resolve, reject) => {
    let stderr = '';
    let stdout = '';
    let shutdownSent = false;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Local notification worker did not produce startup output'));
    }, 5_000);

    child.stderr.setEncoding('utf8');
    child.stdout.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (!shutdownSent && stdout.includes('[notification-worker]')) {
        shutdownSent = true;
        child.kill('SIGTERM');
      }
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stderr, stdout });
    });
  });
}

it('loads development dotenv precedence and shuts down after first worker output', async () => {
  const requests: Array<{ method: string | undefined; url: string | undefined }> = [];
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url });
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'degraded' }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback server did not bind to a TCP port');

  const temporaryCwd = await mkdtemp(path.join(tmpdir(), 'remindly-worker-'));
  try {
    await writeFile(
      path.join(temporaryCwd, '.env'),
      'APP_URL=http://127.0.0.1:1\nSCHEDULER_SECRET=base-worker-test-secret\n',
    );
    await writeFile(
      path.join(temporaryCwd, '.env.development'),
      `APP_URL=http://127.0.0.1:${address.port}\nSCHEDULER_SECRET=development-worker-test-secret\n`,
    );

    const result = await runWorkerUntilFirstOutput(temporaryCwd);

    expect(result.stderr).toBe('');
    expect(
      result.code === 0 || (result.code === null && result.signal === 'SIGTERM'),
    ).toBe(true);
    expect(result.stdout).toContain('application not ready status=503');
    expect(requests).toEqual([{ method: 'GET', url: '/api/health' }]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(temporaryCwd, { recursive: true, force: true });
  }
}, 10_000);
