export interface AlertEligibilityInput {
  reminderStatus: 'ACTIVE' | 'DONE' | 'ARCHIVED';
  alertEnabled: boolean;
  email: string | null;
  emailVerifiedAt: Date | null;
  notificationScheduleVersion: number | null;
  alertScheduleVersion: number;
  notificationScheduledFor: Date;
  alertScheduledFor: Date;
}

export function isCurrentAlertEligible(input: AlertEligibilityInput): boolean {
  return input.reminderStatus === 'ACTIVE'
    && input.alertEnabled
    && Boolean(input.email)
    && input.emailVerifiedAt !== null
    && input.notificationScheduleVersion === input.alertScheduleVersion
    && input.notificationScheduledFor.getTime() === input.alertScheduledFor.getTime();
}
