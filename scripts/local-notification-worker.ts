import nextEnv from '@next/env';
import {
  formatSchedulerCycleResult,
} from '../src/server/notifications/scheduler-client';
import {
  localNotificationWorkerConfig,
  runLocalNotificationWorker,
} from '../src/server/notifications/local-worker';

const abortController = new AbortController();
const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), true);
const config = localNotificationWorkerConfig(process.env);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => abortController.abort());
}

await runLocalNotificationWorker({
  ...config,
  signal: abortController.signal,
  onResult: (result) => {
    console.info(`[notification-worker] ${new Date().toISOString()} ${formatSchedulerCycleResult(result)}`);
  },
});
