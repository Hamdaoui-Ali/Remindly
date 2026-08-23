import {
  runSchedulerCycle,
  type SchedulerCycleResult,
  type SchedulerFetch,
} from './scheduler-client';

export const LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS = 30_000;

export interface LocalNotificationWorkerConfig {
  appUrl: string;
  schedulerSecret: string;
}

type WorkerEnvironment = Record<string, string | undefined>;

export function localNotificationWorkerConfig(
  environment: WorkerEnvironment,
): LocalNotificationWorkerConfig {
  const appUrl = environment.APP_URL?.trim();
  const schedulerSecret = environment.SCHEDULER_SECRET?.trim();
  if (!appUrl) throw new Error('APP_URL must be configured');
  try {
    new URL(appUrl);
  } catch {
    throw new Error('APP_URL must be a valid URL');
  }
  if (!schedulerSecret || schedulerSecret.length < 16) {
    throw new Error('SCHEDULER_SECRET must contain at least 16 characters');
  }
  return { appUrl, schedulerSecret };
}

export interface RunLocalNotificationWorkerInput extends LocalNotificationWorkerConfig {
  signal: AbortSignal;
  fetchImpl?: SchedulerFetch;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  onResult?: (result: SchedulerCycleResult) => void;
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export async function runLocalNotificationWorker(
  input: RunLocalNotificationWorkerInput,
): Promise<void> {
  const wait = input.wait ?? defaultWait;
  while (!input.signal.aborted) {
    const result = await runSchedulerCycle(input);
    input.onResult?.(result);
    if (!input.signal.aborted) {
      await wait(LOCAL_NOTIFICATION_POLL_INTERVAL_MILLISECONDS, input.signal);
    }
  }
}
