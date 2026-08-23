export interface ProcessorCounts {
  claimed: number;
  sent: number;
  failed: number;
  recovered: number;
}

export type SchedulerCycleResult =
  | { kind: 'processed'; status: number; counts: ProcessorCounts }
  | { kind: 'not-ready'; status: number }
  | { kind: 'rejected'; status: number }
  | { kind: 'invalid-response'; status: number }
  | { kind: 'unavailable' };

export type SchedulerFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SchedulerCycleInput {
  appUrl: string;
  schedulerSecret: string;
  signal?: AbortSignal;
  fetchImpl?: SchedulerFetch;
}

function processorCounts(value: unknown): ProcessorCounts | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<Record<keyof ProcessorCounts, unknown>>;
  const keys: Array<keyof ProcessorCounts> = ['claimed', 'sent', 'failed', 'recovered'];
  if (!keys.every((key) => Number.isInteger(candidate[key]) && Number(candidate[key]) >= 0)) return null;
  return {
    claimed: Number(candidate.claimed),
    sent: Number(candidate.sent),
    failed: Number(candidate.failed),
    recovered: Number(candidate.recovered),
  };
}

export async function runSchedulerCycle(input: SchedulerCycleInput): Promise<SchedulerCycleResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.appUrl.endsWith('/') ? input.appUrl : `${input.appUrl}/`;
  try {
    if (input.signal?.aborted) return { kind: 'unavailable' };

    const health = await fetchImpl(new URL('api/health', baseUrl).toString(), {
      method: 'GET',
      signal: input.signal,
    });
    if (!health.ok) return { kind: 'not-ready', status: health.status };
    if (input.signal?.aborted) return { kind: 'unavailable' };

    const response = await fetchImpl(
      new URL('api/internal/process-due-notifications', baseUrl).toString(),
      {
        method: 'POST',
        headers: { 'x-scheduler-secret': input.schedulerSecret },
        redirect: 'error',
        signal: input.signal,
      },
    );
    if (input.signal?.aborted) return { kind: 'unavailable' };
    if (!response.ok) return { kind: 'rejected', status: response.status };
    const counts = processorCounts(await response.json().catch(() => null));
    return counts
      ? { kind: 'processed', status: response.status, counts }
      : { kind: 'invalid-response', status: response.status };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function formatSchedulerCycleResult(result: SchedulerCycleResult): string {
  if (result.kind === 'processed') {
    const { claimed, sent, failed, recovered } = result.counts;
    return `processed status=${result.status} claimed=${claimed} sent=${sent} failed=${failed} recovered=${recovered}`;
  }
  if (result.kind === 'not-ready') return `application not ready status=${result.status}`;
  if (result.kind === 'rejected') return `processor rejected status=${result.status}`;
  if (result.kind === 'invalid-response') return `processor response invalid status=${result.status}`;
  return 'application unavailable';
}
