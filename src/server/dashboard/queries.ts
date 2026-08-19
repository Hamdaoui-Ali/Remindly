import { fromZonedTime } from 'date-fns-tz';

import { prisma } from '@/server/db/client';
import { SETTINGS_SINGLETON_ID } from '@/server/settings/repository';
import { calendarDayDifference, getLocalDate } from '@/server/urgency/calendar';
import { calculateUrgency } from '@/server/urgency/urgency';
import type {
  DashboardData,
  DashboardMonthPoint,
  DashboardReminderItem,
  UrgencyCounts,
} from './types';

interface CountRow {
  active_count: bigint;
  overdue_count: bigint;
  due_seven_count: bigint;
  urgent_count: bigint;
  soon_count: bigint;
  safe_count: bigint;
}

interface OutcomeRow {
  month_key: string;
  completed: bigint;
  renewed: bigint;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function databaseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function shiftCalendarDate(value: string, days: number): string {
  const date = databaseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

function shiftMonth(monthKey: string, months: number): string {
  const date = new Date(`${monthKey}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 7);
}

function monthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${monthKey}-01T00:00:00.000Z`));
}

function localMonthBoundary(monthKey: string, timezone: string): Date {
  return fromZonedTime(`${monthKey}-01T00:00:00`, timezone);
}

function relativeTime(days: number): string {
  if (days < -1) return `${Math.abs(days)} days overdue`;
  if (days === -1) return '1 day overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function presentDashboardReminder(
  reminder: { id: string; name: string; endDate: Date },
  now: Date,
  timezone: string,
): DashboardReminderItem {
  const endDate = dateOnly(reminder.endDate);
  const remainingCalendarDays = calendarDayDifference(endDate, now, timezone);
  return {
    id: reminder.id,
    name: reminder.name,
    endDate,
    urgency: calculateUrgency(endDate, now, timezone),
    remainingCalendarDays,
    relativeTime: relativeTime(remainingCalendarDays),
  };
}

function number(value: bigint | undefined): number {
  return Number(value ?? 0n);
}

export async function getDashboardData(now: Date): Promise<DashboardData> {
  const settings = await prisma.settings.findUnique({
    where: { id: SETTINGS_SINGLETON_ID },
    select: { timezone: true },
  });
  if (!settings) throw new Error('Dashboard settings are not configured');

  const timezone = settings.timezone;
  const localToday = getLocalDate(now, timezone);
  const today = databaseDate(localToday);
  const todayPlusThree = databaseDate(shiftCalendarDate(localToday, 3));
  const todayPlusSeven = databaseDate(shiftCalendarDate(localToday, 7));
  const todayPlusFourteen = databaseDate(shiftCalendarDate(localToday, 14));
  const todayPlusThirty = databaseDate(shiftCalendarDate(localToday, 30));
  const currentMonth = localToday.slice(0, 7);
  const firstMonth = shiftMonth(currentMonth, -5);
  const nextMonth = shiftMonth(currentMonth, 1);
  const monthStart = localMonthBoundary(currentMonth, timezone);
  const nextMonthStart = localMonthBoundary(nextMonth, timezone);
  const historyStart = localMonthBoundary(firstMonth, timezone);

  const [countRows, sentThisMonth, compactReminders, outcomeRows] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date < ${today})::bigint AS overdue_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date >= ${today} AND end_date <= ${todayPlusSeven})::bigint AS due_seven_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date >= ${today} AND end_date <= ${todayPlusThree})::bigint AS urgent_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date > ${todayPlusThree} AND end_date <= ${todayPlusFourteen})::bigint AS soon_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date > ${todayPlusFourteen})::bigint AS safe_count
      FROM reminders
    `,
    prisma.notification.count({
      where: {
        status: 'SENT',
        sentAt: { gte: monthStart, lt: nextMonthStart },
      },
    }),
    prisma.reminder.findMany({
      where: { status: 'ACTIVE', endDate: { lte: todayPlusThirty } },
      select: { id: true, name: true, endDate: true },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.$queryRaw<OutcomeRow[]>`
      SELECT month_key, SUM(completed)::bigint AS completed, SUM(renewed)::bigint AS renewed
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', completed_at AT TIME ZONE ${timezone}), 'YYYY-MM') AS month_key,
          COUNT(*)::bigint AS completed,
          0::bigint AS renewed
        FROM reminders
        WHERE status = 'DONE'
          AND completed_at >= ${historyStart}
          AND completed_at < ${nextMonthStart}
        GROUP BY month_key
        UNION ALL
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE ${timezone}), 'YYYY-MM') AS month_key,
          0::bigint AS completed,
          COUNT(*)::bigint AS renewed
        FROM reminders
        WHERE parent_reminder_id IS NOT NULL
          AND created_at >= ${historyStart}
          AND created_at < ${nextMonthStart}
        GROUP BY month_key
      ) outcomes
      GROUP BY month_key
      ORDER BY month_key
    `,
  ]);

  const counts = countRows[0];
  const urgencyCounts: UrgencyCounts = {
    OVERDUE: number(counts?.overdue_count),
    URGENT: number(counts?.urgent_count),
    SOON: number(counts?.soon_count),
    SAFE: number(counts?.safe_count),
  };
  const presented = compactReminders.map((reminder) => presentDashboardReminder(reminder, now, timezone));
  const outcomeByMonth = new Map(outcomeRows.map((row) => [row.month_key, row]));
  const completedVsRenewed: DashboardMonthPoint[] = Array.from({ length: 6 }, (_, index) => {
    const monthKey = shiftMonth(firstMonth, index);
    const outcome = outcomeByMonth.get(monthKey);
    return {
      monthKey,
      label: monthLabel(monthKey),
      completed: number(outcome?.completed),
      renewed: number(outcome?.renewed),
    };
  });

  return {
    timezone,
    generatedForLocalDate: localToday,
    summary: {
      activeReminders: number(counts?.active_count),
      overdue: urgencyCounts.OVERDUE,
      dueInSevenDays: number(counts?.due_seven_count),
      sentThisMonth,
    },
    attention: presented.filter(({ urgency }) => urgency === 'OVERDUE' || urgency === 'URGENT'),
    urgencyCounts,
    completedVsRenewed,
    nextThirtyDays: presented,
  };
}
