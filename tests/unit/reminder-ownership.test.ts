import { describe, expect, it, vi } from 'vitest';

import { ReminderRepository } from '@/server/reminders/repository';

describe('ReminderRepository ownership boundary', () => {
  it('includes the authenticated user ID when finding a reminder', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repository = new ReminderRepository({ reminder: { findFirst } } as never);

    await repository.findById('user-a', 'reminder-b');

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'reminder-b', userId: 'user-a' },
    });
  });

  it('includes the authenticated user ID when listing active reminders', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repository = new ReminderRepository({ reminder: { findMany } } as never);

    await repository.listActive('user-a');

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', status: 'ACTIVE' },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
    });
  });
});
