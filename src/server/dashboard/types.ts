import type { Urgency } from '@/server/urgency/types';

export interface DashboardSummary {
  activeReminders: number;
  overdue: number;
  dueInSevenDays: number;
  sentThisMonth: number;
}

export interface DashboardReminderItem {
  id: string;
  name: string;
  endDate: string;
  urgency: Urgency;
  remainingCalendarDays: number;
  relativeTime: string;
}

export type UrgencyCounts = Record<Urgency, number>;

export interface DashboardMonthPoint {
  monthKey: string;
  label: string;
  completed: number;
  renewed: number;
}

export interface DashboardData {
  timezone: string;
  generatedForLocalDate: string;
  summary: DashboardSummary;
  attention: DashboardReminderItem[];
  urgencyCounts: UrgencyCounts;
  completedVsRenewed: DashboardMonthPoint[];
  nextThirtyDays: DashboardReminderItem[];
}
