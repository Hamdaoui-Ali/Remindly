export type NotificationReadinessCheckResult =
  | { kind: 'ready'; issues: [] }
  | { kind: 'degraded'; issues: string[] }
  | { kind: 'unavailable' };

export interface NotificationReadinessCheckInput {
  appUrl: string;
  schedulerSecret: string;
  fetchImpl?: typeof fetch;
}

function readinessBody(value: unknown): { status: 'ready' | 'degraded'; issues: string[] } | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { status?: unknown; issues?: unknown };
  if (candidate.status !== 'ready' && candidate.status !== 'degraded') return null;
  if (!Array.isArray(candidate.issues) || !candidate.issues.every((issue) => (
    typeof issue === 'string'
    && issue.length > 0
    && issue.length <= 160
    && !issue.includes('=')
  ))) return null;
  if (candidate.status === 'ready' && candidate.issues.length !== 0) return null;
  if (candidate.status === 'degraded' && candidate.issues.length === 0) return null;
  return { status: candidate.status, issues: candidate.issues };
}

export async function runNotificationReadinessCheck(
  input: NotificationReadinessCheckInput,
): Promise<NotificationReadinessCheckResult> {
  const baseUrl = input.appUrl.endsWith('/') ? input.appUrl : `${input.appUrl}/`;
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(
      new URL('api/internal/notification-readiness', baseUrl),
      { headers: { 'x-scheduler-secret': input.schedulerSecret } },
    );
    const body = readinessBody(await response.json().catch(() => null));
    if (!body) return { kind: 'unavailable' };
    if (response.status === 200 && body.status === 'ready') {
      return { kind: 'ready', issues: [] };
    }
    if (response.status === 503 && body.status === 'degraded') {
      return { kind: 'degraded', issues: body.issues };
    }
    return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function formatNotificationReadinessResult(
  result: NotificationReadinessCheckResult,
): string {
  if (result.kind === 'ready') return 'ready';
  if (result.kind === 'degraded') return `degraded: ${result.issues.join(', ')}`;
  return 'unavailable';
}
