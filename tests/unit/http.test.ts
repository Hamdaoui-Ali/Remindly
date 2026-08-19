import { describe, expect, it } from 'vitest';
import { errorResponse } from '@/lib/http';

describe('errorResponse', () => {
  it('serializes a client-safe JSON error with the requested status', async () => {
    const response = errorResponse('Invalid reminder input', 422);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid reminder input' });
  });
});
