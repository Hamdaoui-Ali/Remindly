export interface CutoverVerificationInput {
  activeRemindersMissingOwners: number;
  remindersMissingDueAt: number;
  notificationsMissingAlerts: number;
  notificationsMissingScheduleVersions: number;
  alertsMissingCurrentNotifications: number;
  legacyClaimableNotifications: number;
}

export interface CutoverVerification {
  ready: boolean;
  failures: string[];
}

export function evaluateCutoverVerification(
  report: CutoverVerificationInput,
): CutoverVerification {
  const failures: string[] = [];
  const checks: Array<[number, string]> = [
    [report.activeRemindersMissingOwners, 'active reminders are missing owners'],
    [report.remindersMissingDueAt, 'reminders are missing due timestamps'],
    [report.notificationsMissingAlerts, 'notifications are missing alert links'],
    [report.notificationsMissingScheduleVersions, 'notifications are missing schedule versions'],
    [report.alertsMissingCurrentNotifications, 'alerts are missing current notifications'],
    [report.legacyClaimableNotifications, 'legacy notifications remain claimable'],
  ];

  for (const [count, message] of checks) {
    if (count > 0) failures.push(message);
  }

  return { ready: failures.length === 0, failures };
}
