import type { Prisma, PrismaClient, Reminder, ReminderStatus } from '@/generated/prisma/client';
import type { ReminderWithAlerts, ReminderWithNotifications } from './types';

export type ReminderDatabase = PrismaClient | Prisma.TransactionClient;

function isReminderStatus(value: string): value is ReminderStatus {
  return value === 'ACTIVE' || value === 'DONE' || value === 'ARCHIVED';
}

export interface CreateReminderRecord {
  name: string;
  dueAt?: Date;
  endDate: Date;
  alertLeadDays: number;
  alertTime: string;
  alertAt: Date;
  parentReminderId?: string;
}

export interface UpdateReminderRecord {
  name?: string;
  dueAt?: Date;
  endDate?: Date;
  alertLeadDays?: number;
  alertTime?: string;
  alertAt?: Date;
}

export class ReminderRepository {
  constructor(private readonly db: ReminderDatabase) {}

  findByIdForUser(userId: string, id: string): Promise<Reminder | null> {
    return this.db.reminder.findFirst({ where: { id, userId } });
  }

  findById(userIdOrId: string, id?: string): Promise<Reminder | null> {
    return this.db.reminder.findFirst({ where: id ? { id, userId: userIdOrId } : { id: userIdOrId } });
  }

  findByIdWithNotifications(userIdOrId: string, id?: string): Promise<ReminderWithNotifications | null> {
    return this.db.reminder.findFirst({
      where: id ? { id, userId: userIdOrId } : { id: userIdOrId },
      include: {
        notifications: { orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }] },
        alerts: { orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }] },
      },
    });
  }

  findByIdWithAlerts(userIdOrId: string, id?: string): Promise<ReminderWithAlerts | null> {
    return this.db.reminder.findFirst({
      where: id ? { id, userId: userIdOrId } : { id: userIdOrId },
      include: { alerts: { orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  findByIdWithAlertsForUser(userId: string, id: string): Promise<ReminderWithAlerts | null> {
    return this.db.reminder.findFirst({
      where: { id, userId },
      include: { alerts: { orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }] } },
    });
  }

  listActive(userId?: string): Promise<Reminder[]> {
    return this.db.reminder.findMany({
      where: userId ? { userId, status: 'ACTIVE' } : { status: 'ACTIVE' },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(userIdOrInput: string | CreateReminderRecord, maybeInput?: CreateReminderRecord): Promise<Reminder> {
    const userId = typeof userIdOrInput === 'string' ? userIdOrInput : undefined;
    const input = typeof userIdOrInput === 'string' ? maybeInput! : userIdOrInput;
    return this.db.reminder.create({ data: { ...input, ...(userId ? { userId } : {}) } });
  }

  createForUser(userId: string, input: CreateReminderRecord): Promise<Reminder> {
    return this.db.reminder.create({ data: { ...input, userId } });
  }

  update(userIdOrId: string, idOrPatch: string | UpdateReminderRecord, maybePatch?: UpdateReminderRecord): Promise<Reminder> {
    const userId = typeof idOrPatch === 'string' ? userIdOrId : undefined;
    const id = typeof idOrPatch === 'string' ? idOrPatch : userIdOrId;
    const patch = typeof idOrPatch === 'string' ? maybePatch! : idOrPatch;
    return this.db.reminder.updateMany({ where: userId ? { id, userId } : { id }, data: patch }).then(async (result) => {
      if (result.count !== 1) throw new Error('Reminder not found');
      return this.db.reminder.findFirstOrThrow({ where: userId ? { id, userId } : { id } });
    });
  }

  async updateWhenStatus(
    userIdOrId: string,
    idOrStatuses: string | ReminderStatus[],
    statusesOrPatch: ReminderStatus[] | Prisma.ReminderUpdateManyMutationInput,
    maybePatch?: Prisma.ReminderUpdateManyMutationInput,
  ): Promise<number> {
    const userId = typeof idOrStatuses === 'string' ? userIdOrId : undefined;
    const id = typeof idOrStatuses === 'string' ? idOrStatuses : userIdOrId;
    const expectedStatuses = (typeof idOrStatuses === 'string' ? statusesOrPatch : idOrStatuses) as ReminderStatus[];
    const patch = (maybePatch ?? statusesOrPatch) as Prisma.ReminderUpdateManyMutationInput;
    const result = await this.db.reminder.updateMany({
      where: { id, ...(userId ? { userId } : {}), status: { in: expectedStatuses } },
      data: patch,
    });
    return result.count;
  }

  updateWhenStatusForUser(
    userId: string,
    id: string,
    expectedStatuses: ReminderStatus[],
    patch: Prisma.ReminderUpdateManyMutationInput,
  ): Promise<number> {
    return this.db.reminder.updateMany({
      where: { id, userId, status: { in: expectedStatuses } },
      data: patch,
    }).then((result) => result.count);
  }

  async setStatus(
    userIdOrId: string,
    idOrStatus: string | ReminderStatus,
    statusOrCompletedAt?: ReminderStatus | Date | null,
    maybeCompletedAt?: Date | null,
  ): Promise<Reminder> {
    const legacyCall = isReminderStatus(idOrStatus);
    const userId = legacyCall ? undefined : userIdOrId;
    const id = legacyCall ? userIdOrId : idOrStatus;
    const status = (legacyCall ? idOrStatus : statusOrCompletedAt) as ReminderStatus;
    const completedAt = (legacyCall ? statusOrCompletedAt : maybeCompletedAt) as Date | null | undefined;
    const result = await this.db.reminder.updateMany({
      where: userId ? { id, userId } : { id },
      data: { status, ...(completedAt === undefined ? {} : { completedAt }) },
    });
    if (result.count !== 1) throw new Error('Reminder not found');
    return this.db.reminder.findFirstOrThrow({ where: userId ? { id, userId } : { id } });
  }
}
