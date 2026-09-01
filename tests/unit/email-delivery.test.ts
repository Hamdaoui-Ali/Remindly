import { describe, expect, it, vi } from 'vitest';
import { EmailDeliveryError } from '@/server/email/provider';
import { createEmailDelivery } from '@/server/email/delivery';
import type { SendEmailInput } from '@/server/email/provider';

const message: SendEmailInput = {
  to: 'person@example.com',
  subject: 'Reminder',
  html: '<p>Reminder</p>',
  text: 'Reminder',
  idempotencyKey: 'notification-1',
};

function setup() {
  const calls: string[] = [];
  const provider = { send: vi.fn(async () => { calls.push('provider'); return { providerMessageId: 'gmail-1' }; }) };
  const circuit = { isOpen: vi.fn(() => false), success: vi.fn(), failure: vi.fn() };
  const reserve = vi.fn<(_purpose: 'REMINDER' | 'AUTH', _now: Date) => Promise<{ id: string } | null>>(async () => { calls.push('reserve'); return { id: 'attempt-1' }; });
  const finalize = vi.fn(async (...args: unknown[]) => { calls.push(`finalize:${String(args[1])}`); });
  return { calls, provider, circuit, reserve, finalize };
}

describe('EmailDeliveryService', () => {
  it('reserves before sending and finalizes accepted delivery', async () => {
    const deps = setup();
    const service = createEmailDelivery(deps);

    await expect(service.send('REMINDER', message, new Date(1))).resolves.toEqual({
      status: 'sent',
      providerMessageId: 'gmail-1',
    });
    expect(deps.calls).toEqual(['reserve', 'provider', 'finalize:ACCEPTED']);
    expect(deps.circuit.success).toHaveBeenCalledOnce();
  });

  it('uses an existing reminder reservation without creating a second attempt', async () => {
    const deps = setup();
    const service = createEmailDelivery(deps);

    await expect(service.send('REMINDER', message, new Date(1), 'attempt-existing')).resolves.toEqual({
      status: 'sent',
      providerMessageId: 'gmail-1',
    });
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(deps.finalize).toHaveBeenCalledWith(
      'attempt-existing',
      'ACCEPTED',
      expect.any(Date),
      expect.objectContaining({ providerMessageId: 'gmail-1' }),
    );
  });

  it('does not call the provider when budget or circuit blocks delivery', async () => {
    const budget = setup();
    budget.reserve.mockResolvedValue(null);
    await expect(createEmailDelivery(budget).send('AUTH', message, new Date(1))).resolves.toEqual({ status: 'blocked', reason: 'budget_exhausted' });
    expect(budget.provider.send).not.toHaveBeenCalled();

    const circuit = setup();
    circuit.circuit.isOpen.mockReturnValue(true);
    await expect(createEmailDelivery(circuit).send('AUTH', message, new Date(1))).resolves.toEqual({ status: 'blocked', reason: 'circuit_open' });
    expect(circuit.reserve).not.toHaveBeenCalled();
  });

  it('finalizes known and ambiguous provider failures with sanitized codes', async () => {
    const definite = setup();
    definite.provider.send.mockRejectedValue(new EmailDeliveryError('definite_failure'));
    await expect(createEmailDelivery(definite).send('REMINDER', message, new Date(1))).rejects.toBeInstanceOf(EmailDeliveryError);
    expect(definite.finalize).toHaveBeenCalledWith('attempt-1', 'DEFINITE_FAILURE', expect.any(Date), expect.objectContaining({ sanitizedCode: 'email_provider_definite_failure' }));

    const unknown = setup();
    unknown.provider.send.mockRejectedValue(new EmailDeliveryError('unknown_outcome'));
    await expect(createEmailDelivery(unknown).send('AUTH', message, new Date(1))).rejects.toBeInstanceOf(EmailDeliveryError);
    expect(unknown.finalize).toHaveBeenCalledWith('attempt-1', 'UNKNOWN_OUTCOME', expect.any(Date), expect.objectContaining({ sanitizedCode: 'email_provider_unknown_outcome' }));
  });
});
