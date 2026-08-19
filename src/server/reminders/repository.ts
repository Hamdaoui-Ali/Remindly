import type { Prisma, PrismaClient, Reminder, ReminderStatus } from '@/generated/prisma/client';

export type ReminderDatabase = PrismaClient | Prisma.TransactionClient;

export interface CreateReminderRecord {
  name: string;
  endDate: Date;
  alertLeadDays: number;
  alertTime: string;
  alertAt: Date;
  parentReminderId?: string;
}

export interface UpdateReminderRecord {
  name?: string;
  endDate?: Date;
  alertLeadDays?: number;
  alertTime?: string;
  alertAt?: Date;
}

export class ReminderRepository {
  constructor(private readonly db: ReminderDatabase) {}

  findById(id: string): Promise<Reminder | null> {
    return this.db.reminder.findUnique({ where: { id } });
  }

  listActive(): Promise<Reminder[]> {
    return this.db.reminder.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(input: CreateReminderRecord): Promise<Reminder> {
    return this.db.reminder.create({ data: input });
  }

  update(id: string, patch: UpdateReminderRecord): Promise<Reminder> {
    return this.db.reminder.update({ where: { id }, data: patch });
  }

  setStatus(id: string, status: ReminderStatus, completedAt?: Date | null): Promise<Reminder> {
    return this.db.reminder.update({
      where: { id },
      data: { status, ...(completedAt === undefined ? {} : { completedAt }) },
    });
  }
}
