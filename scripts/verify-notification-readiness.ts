import nextEnv from '@next/env';
import {
  formatNotificationReadinessResult,
  runNotificationReadinessCheck,
} from '../src/server/notifications/readiness-client';
import { localNotificationWorkerConfig } from '../src/server/notifications/local-worker';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

const config = localNotificationWorkerConfig(process.env);
const result = await runNotificationReadinessCheck(config);

console.info(`notification readiness: ${formatNotificationReadinessResult(result)}`);
if (result.kind !== 'ready') process.exitCode = 1;
