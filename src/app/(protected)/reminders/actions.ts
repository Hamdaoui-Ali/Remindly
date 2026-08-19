'use client';

export class ReminderRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = 'ReminderRequestError';
  }
}

export async function reminderRequest<T>(url: string, method: 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    fields?: Record<string, string[] | undefined>;
  };

  if (!response.ok) {
    throw new ReminderRequestError(payload.error ?? 'Request failed', response.status, payload.fields);
  }

  return payload as T;
}
