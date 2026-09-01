import { Prisma } from '@/generated/prisma/client';
import type { PrismaClient } from '@/generated/prisma/client';
import { prisma } from '@/server/db/client';
import { SETTINGS_SINGLETON_ID } from '@/server/settings/repository';
import { calendarDayDifference, getLocalDate } from '@/server/urgency/calendar';
import { calculateUrgency } from '@/server/urgency/urgency';
import { relativeTime } from '@/server/reminders/relative-time';
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

interface SentRow {
  sent_count: bigint;
}

interface CompactReminderRow {
  id: string;
  name: string;
  end_date: string;
  scheduled_for: string | null;
}

export type DashboardDatabase = PrismaClient | Prisma.TransactionClient;

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

function presentDashboardReminder(
  reminder: CompactReminderRow,
  now: Date,
  timezone: string,
): DashboardReminderItem {
  const endDate = reminder.end_date;
  const remainingCalendarDays = calendarDayDifference(endDate, now, timezone);
  return {
    id: reminder.id,
    name: reminder.name,
    endDate,
    urgency: calculateUrgency(endDate, now, timezone),
    remainingCalendarDays,
    relativeTime: relativeTime(remainingCalendarDays),
    scheduledEmail: reminder.scheduled_for
      ? {
          scheduledFor: reminder.scheduled_for,
          label: new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: timezone,
          }).format(new Date(reminder.scheduled_for)),
        }
      : null,
  };
}

function number(value: bigint | undefined): number {
  return Number(value ?? 0n);
}

export async function getDashboardData(
  userIdOrNow: string | Date,
  nowOrDb?: Date | DashboardDatabase,
  maybeDb?: DashboardDatabase,
): Promise<DashboardData> {
  const userId = typeof userIdOrNow === 'string' ? userIdOrNow : undefined;
  const now = typeof userIdOrNow === 'string' ? nowOrDb as Date : userIdOrNow;
  const db = (typeof userIdOrNow === 'string' ? maybeDb : nowOrDb) as DashboardDatabase | undefined ?? prisma;
  const reminderFilter = userId ? Prisma.sql`AND user_id = ${userId}::uuid` : Prisma.empty;
  const joinedReminderFilter = userId ? Prisma.sql`AND reminder.user_id = ${userId}::uuid` : Prisma.empty;
  const settings = userId
    ? await db.userProfile.findUnique({ where: { id: userId }, select: { timezone: true } })
    : await db.settings.findUnique({ where: { id: SETTINGS_SINGLETON_ID }, select: { timezone: true } });
  if (!settings) throw new Error('Dashboard settings are not configured');

  const timezone = settings.timezone;
  const localToday = getLocalDate(now, timezone);
  const todayPlusThree = shiftCalendarDate(localToday, 3);
  const todayPlusSeven = shiftCalendarDate(localToday, 7);
  const todayPlusFourteen = shiftCalendarDate(localToday, 14);
  const todayPlusThirty = shiftCalendarDate(localToday, 30);
  const currentMonth = localToday.slice(0, 7);
  const firstMonth = shiftMonth(currentMonth, -5);
  const nextMonth = shiftMonth(currentMonth, 1);
  const monthStart = `${currentMonth}-01T00:00:00`;
  const nextMonthStart = `${nextMonth}-01T00:00:00`;
  const historyStart = `${firstMonth}-01T00:00:00`;

  const [countRows, sentRows, compactReminders, outcomeRows] = await Promise.all([
    db.$queryRaw<CountRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'ACTIVE')::bigint AS active_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date < ${localToday}::date)::bigint AS overdue_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date >= ${localToday}::date AND end_date <= ${todayPlusSeven}::date)::bigint AS due_seven_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date >= ${localToday}::date AND end_date <= ${todayPlusThree}::date)::bigint AS urgent_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date > ${todayPlusThree}::date AND end_date <= ${todayPlusFourteen}::date)::bigint AS soon_count,
        COUNT(*) FILTER (WHERE status = 'ACTIVE' AND end_date > ${todayPlusFourteen}::date)::bigint AS safe_count
      FROM reminders
      WHERE 1 = 1
        ${reminderFilter}
    `,
    db.$queryRaw<SentRow[]>`
      SELECT COUNT(*)::bigint AS sent_count
      FROM notifications
      INNER JOIN reminders AS reminder ON reminder.id = notifications.reminder_id
      WHERE notifications.status = 'SENT'
        ${joinedReminderFilter}
        AND sent_at >= (${monthStart}::timestamp AT TIME ZONE ${timezone})
        AND sent_at < (${nextMonthStart}::timestamp AT TIME ZONE ${timezone})
    `,
    db.$queryRaw<CompactReminderRow[]>`
      SELECT
        reminder.id,
        reminder.name,
        reminder.end_date::text AS end_date,
        CASE WHEN current_notification.scheduled_for IS NULL THEN NULL ELSE
          TO_CHAR(
            current_notification.scheduled_for AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        END AS scheduled_for
      FROM reminders reminder
      LEFT JOIN LATERAL (
        SELECT notification.scheduled_for
        FROM notifications notification
        WHERE notification.reminder_id = reminder.id
          AND notification.channel = 'EMAIL'
          AND notification.scheduled_for = reminder.alert_at
        ORDER BY notification.created_at DESC
        LIMIT 1
      ) current_notification ON TRUE
      WHERE reminder.status = 'ACTIVE'
        ${joinedReminderFilter}
        AND reminder.end_date <= ${todayPlusThirty}::date
      ORDER BY reminder.end_date ASC, reminder.created_at ASC
    `,
    db.$queryRaw<OutcomeRow[]>`
      SELECT month_key, SUM(completed)::bigint AS completed, SUM(renewed)::bigint AS renewed
      FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', completed_at AT TIME ZONE ${timezone}), 'YYYY-MM') AS month_key,
          COUNT(*)::bigint AS completed,
          0::bigint AS renewed
        FROM reminders
        WHERE status = 'DONE'
          ${reminderFilter}
          AND completed_at >= (${historyStart}::timestamp AT TIME ZONE ${timezone})
          AND completed_at < (${nextMonthStart}::timestamp AT TIME ZONE ${timezone})
        GROUP BY month_key
        UNION ALL
        SELECT
          TO_CHAR(DATE_TRUNC('month', created_at AT TIME ZONE ${timezone}), 'YYYY-MM') AS month_key,
          0::bigint AS completed,
          COUNT(*)::bigint AS renewed
        FROM reminders
        WHERE parent_reminder_id IS NOT NULL
          ${reminderFilter}
          AND created_at >= (${historyStart}::timestamp AT TIME ZONE ${timezone})
          AND created_at < (${nextMonthStart}::timestamp AT TIME ZONE ${timezone})
        GROUP BY month_key
      ) outcomes
      GROUP BY month_key
      ORDER BY month_key
    `,
  ]);

  const counts = countRows[0];
  const sentThisMonth = number(sentRows[0]?.sent_count);
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
