import { createServer, type Server } from 'node:http';
import { expect, it } from 'vitest';

import { runSchedulerCycle } from '@/server/notifications/scheduler-client';

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Loopback server did not bind to a TCP port');
  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

it('refuses processor redirects before the scheduler secret reaches the target', async () => {
  const redirectTargetRequests: Array<{
    method: string | undefined;
    schedulerSecret: string | string[] | undefined;
  }> = [];
  const redirectTarget = createServer((request, response) => {
    redirectTargetRequests.push({
      method: request.method,
      schedulerSecret: request.headers['x-scheduler-secret'],
    });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ claimed: 0, sent: 0, failed: 0, recovered: 0 }));
  });
  const redirectTargetPort = await listen(redirectTarget);
  let processorRequests = 0;
  const application = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'ok', database: 'ok' }));
      return;
    }
    if (request.method === 'POST' && request.url === '/api/internal/process-due-notifications') {
      processorRequests += 1;
      response.writeHead(307, {
        location: `http://127.0.0.1:${redirectTargetPort}/redirect-target`,
      });
      response.end();
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const applicationPort = await listen(application);

  try {
    await expect(runSchedulerCycle({
      appUrl: `http://127.0.0.1:${applicationPort}`,
      schedulerSecret: 'redirect-contract-secret',
    })).resolves.toEqual({ kind: 'unavailable' });
    expect(processorRequests).toBe(1);
    expect(redirectTargetRequests).toEqual([]);
  } finally {
    await close(application);
    await close(redirectTarget);
  }
});
