import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RemindersPage } from '@/components/reminders/reminders-page';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

type FixtureOverrides = Partial<{
  id: string;
  name: string;
  endDate: string;
  urgency: 'OVERDUE' | 'URGENT' | 'SOON' | 'SAFE';
  remainingCalendarDays: number;
  scheduledFor: string;
  scheduledLabel: string;
  leadDays: number;
  alertTime: string;
}>;

function reminder(overrides: FixtureOverrides = {}) {
  const id = overrides.id ?? '11111111-1111-4111-8111-111111111111';
  return {
    id,
    name: overrides.name ?? 'Passport renewal',
    endDate: overrides.endDate ?? '2026-08-18',
    alertLeadDays: overrides.leadDays ?? 7,
    alertTime: overrides.alertTime ?? '09:00',
    status: 'ACTIVE' as const,
    parentReminderId: null,
    urgency: overrides.urgency ?? 'OVERDUE' as const,
    urgencyLabel: overrides.urgency === 'SAFE' ? 'Safe' : overrides.urgency === 'URGENT' ? 'Urgent' : overrides.urgency === 'SOON' ? 'Soon' : 'Overdue',
    remainingCalendarDays: overrides.remainingCalendarDays ?? -1,
    relativeTime: overrides.remainingCalendarDays === 2 ? '2 days left' : overrides.remainingCalendarDays === 20 ? '20 days left' : '1 day overdue',
    scheduledEmail: {
      id: `notification-${id}`,
      scheduledFor: overrides.scheduledFor ?? '2026-08-11T08:00:00.000Z',
      status: 'PENDING' as const,
      channel: 'EMAIL' as const,
      label: overrides.scheduledLabel ?? 'Scheduled email Aug 11, 2026, 9:00 AM',
    },
  };
}

beforeEach(() => {
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe('RemindersPage', () => {
  it('renders urgency groups in overdue-to-safe order and shows every required row field', () => {
    render(
      <RemindersPage
        reminders={[
          reminder({ id: '33333333-3333-4333-8333-333333333333', name: 'Safe item', urgency: 'SAFE', remainingCalendarDays: 20, endDate: '2026-09-08' }),
          reminder(),
          reminder({ id: '22222222-2222-4222-8222-222222222222', name: 'Urgent item', urgency: 'URGENT', remainingCalendarDays: 2, endDate: '2026-08-21' }),
        ]}
        defaultAlertTime="09:00"
      />,
    );

    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual([
      'Overdue',
      'Urgent',
      'Safe',
    ]);
    const passportRow = screen.getByText('Passport renewal').closest('article');
    expect(passportRow).not.toBeNull();
    expect(within(passportRow!).getByText('Overdue')).toBeVisible();
    expect(within(passportRow!).getByText(/Aug 18, 2026/)).toBeVisible();
    expect(within(passportRow!).getByText('1 day overdue')).toBeVisible();
    expect(within(passportRow!).getByText(/scheduled email/i)).toBeVisible();
  });

  it('uses one Add reminder action for an empty state', () => {
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    expect(screen.getAllByRole('button', { name: /add reminder/i })).toHaveLength(1);
    expect(screen.getByText(/add your first deadline/i)).toBeVisible();
  });

  it('validates required fields before sending a create request', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const user = userEvent.setup();
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /add reminder/i }));
    await user.click(screen.getByRole('button', { name: /save reminder/i }));

    expect(screen.getByText('Enter a reminder name.')).toHaveAttribute('role', 'alert');
    expect(screen.getByText('Choose an end date.')).toHaveAttribute('role', 'alert');
    expect(request).not.toHaveBeenCalled();
  });

  it('reveals an exact reminder date when Custom is selected', async () => {
    const user = userEvent.setup();
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /add reminder/i }));
    await user.selectOptions(screen.getByLabelText('Remind me'), 'custom');

    expect(screen.getByLabelText('Reminder date')).toHaveAttribute('type', 'date');
  });

  it('blocks a custom reminder date after the end date', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const user = userEvent.setup();
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /add reminder/i }));
    await user.type(screen.getByLabelText('Name'), 'Invalid custom date');
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-23' } });
    await user.selectOptions(screen.getByLabelText('Remind me'), 'custom');
    fireEvent.change(screen.getByLabelText('Reminder date'), { target: { value: '2026-08-24' } });
    await user.click(screen.getByRole('button', { name: /save reminder/i }));

    expect(screen.getByText('Reminder date must be on or before the end date.')).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });

  it('submits a custom date as its calendar-day lead', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cycle: { reminder: reminder({ leadDays: 2 }) } }),
    });
    vi.stubGlobal('fetch', request);
    const user = userEvent.setup();
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /add reminder/i }));
    await user.type(screen.getByLabelText('Name'), 'Two days before');
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-08-26' } });
    await user.selectOptions(screen.getByLabelText('Remind me'), 'custom');
    fireEvent.change(screen.getByLabelText('Reminder date'), { target: { value: '2026-08-24' } });
    fireEvent.change(screen.getByLabelText('At'), { target: { value: '10:15' } });
    await user.click(screen.getByRole('button', { name: /save reminder/i }));

    const body = JSON.parse(request.mock.calls[0]?.[1]?.body as string);
    expect(body).toMatchObject({ endDate: '2026-08-26', leadDays: 2, alertTime: '10:15' });
  });

  it('reopens a non-preset lead as its exact custom date', async () => {
    const user = userEvent.setup();
    render(<RemindersPage reminders={[reminder({ endDate: '2026-08-26', leadDays: 2 })]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /actions for passport renewal/i }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByLabelText('Remind me')).toHaveValue('custom');
    expect(screen.getByLabelText('Reminder date')).toHaveValue('2026-08-24');
  });

  it('refreshes server data and closes the drawer after a successful create', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ cycle: { reminder: reminder({ id: '44444444-4444-4444-8444-444444444444', name: 'Car insurance' }) } }),
    });
    vi.stubGlobal('fetch', request);
    const user = userEvent.setup();
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /add reminder/i }));
    await user.type(screen.getByLabelText('Name'), 'Car insurance');
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-01' } });
    await user.click(screen.getByRole('button', { name: /save reminder/i }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/reminders', expect.objectContaining({ method: 'POST' })));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog', { name: /add reminder/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add reminder/i })).toHaveFocus();
  });

  it('applies a schedule-only edit completely and reopens with the new values', async () => {
    const updated = reminder({
      leadDays: 14,
      alertTime: '10:30',
      scheduledFor: '2026-08-04T09:30:00.000Z',
      scheduledLabel: 'Scheduled email Aug 4, 2026, 10:30 AM',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reminder: updated }),
    }));
    const user = userEvent.setup();
    render(<RemindersPage reminders={[reminder()]} defaultAlertTime="09:00" timezone="Africa/Casablanca" />);

    const actionTrigger = screen.getByRole('button', { name: /actions for passport renewal/i });
    await user.click(actionTrigger);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.selectOptions(screen.getByLabelText('Remind me'), '14');
    fireEvent.change(screen.getByLabelText('At'), { target: { value: '10:30' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Scheduled email Aug 4, 2026, 10:30 AM')).toBeVisible();
    expect(actionTrigger).toHaveFocus();
    await user.click(actionTrigger);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Remind me')).toHaveValue('14');
    expect(screen.getByLabelText('At')).toHaveValue('10:30');
  });

  it('restores focus to the edit trigger when the drawer closes without saving', async () => {
    const user = userEvent.setup();
    render(<RemindersPage reminders={[reminder()]} defaultAlertTime="09:00" />);
    const actionTrigger = screen.getByRole('button', { name: /actions for passport renewal/i });

    await user.click(actionTrigger);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(actionTrigger).toHaveFocus();
  });

  it('preserves form values and shows an inline alert after an unknown failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'Internal server error' }) }));
    const user = userEvent.setup();
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /add reminder/i }));
    await user.type(screen.getByLabelText('Name'), 'Keep this value');
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-01' } });
    await user.click(screen.getByRole('button', { name: /save reminder/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
    expect(screen.getByLabelText('Name')).toHaveValue('Keep this value');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-12-01');
  });

  it('warns about a past alert date without blocking submission', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ cycle: { reminder: reminder() } }) });
    vi.stubGlobal('fetch', request);
    const user = userEvent.setup();
    render(<RemindersPage reminders={[]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /add reminder/i }));
    await user.type(screen.getByLabelText('Name'), 'Old document');
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2020-01-01' } });

    expect(screen.getByText(/email alert is already due/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /save reminder/i }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
  });

  it('confirms completion, removes the row locally, and refreshes server data', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reminder: { status: 'DONE' } }) });
    vi.stubGlobal('fetch', request);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const user = userEvent.setup();
    render(<RemindersPage reminders={[reminder()]} defaultAlertTime="09:00" />);

    await user.click(screen.getByRole('button', { name: /actions for passport renewal/i }));
    await user.click(screen.getByRole('button', { name: /mark done/i }));

    await waitFor(() => expect(request).toHaveBeenCalledWith(
      '/api/reminders/11111111-1111-4111-8111-111111111111/done',
      expect.objectContaining({ method: 'POST' }),
    ));
    expect(screen.queryByText('Passport renewal')).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });
});
