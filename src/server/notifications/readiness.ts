const MAXIMUM_PROCESSOR_HEARTBEAT_AGE_MILLISECONDS = 10 * 60_000;

export interface NotificationReadinessSnapshot {
  now: Date;
  configurationFailureCode: string | null;
  cronJobActive: boolean;
  latestProcessorRun: {
    status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    startedAt: Date;
    failureCode: string | null;
  } | null;
  overduePendingCount: number;
}

export interface NotificationReadinessResult {
  ready: boolean;
  issues: string[];
}

export function evaluateNotificationReadiness(
  snapshot: NotificationReadinessSnapshot,
): NotificationReadinessResult {
  const issues: string[] = [];

  if (snapshot.configurationFailureCode) {
    issues.push(`configuration:${snapshot.configurationFailureCode}`);
  }
  if (!snapshot.cronJobActive) issues.push('cron:inactive');

  if (!snapshot.latestProcessorRun) {
    issues.push('processor:missing');
  } else {
    if (snapshot.latestProcessorRun.status === 'FAILED') {
      issues.push(`processor:failed:${snapshot.latestProcessorRun.failureCode ?? 'unknown'}`);
    }
    const heartbeatAge = snapshot.now.getTime() - snapshot.latestProcessorRun.startedAt.getTime();
    if (heartbeatAge > MAXIMUM_PROCESSOR_HEARTBEAT_AGE_MILLISECONDS) {
      issues.push('processor:stale');
    }
  }

  if (snapshot.overduePendingCount > 0) {
    issues.push(`notifications:overdue_pending:${snapshot.overduePendingCount}`);
  }

  return { ready: issues.length === 0, issues };
}
