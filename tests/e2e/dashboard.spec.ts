import { expect, test } from '@playwright/test';

test('owner sees the operational dashboard and accessible chart fallbacks', async ({ page }) => {
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'owner@example.com';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'correct-password';

  await page.goto('/login');
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password').fill(ownerPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const suffix = Date.now();
  const created = await page.evaluate(async ({ suffix: testSuffix }) => {
    const reminders = [];
    for (let day = 20; day <= 26; day += 1) {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Dashboard deadline ${testSuffix}-${day}`,
          endDate: `2026-08-${day}`,
          leadDays: 0,
          alertTime: '09:00',
        }),
      });
      if (!response.ok) throw new Error(`Reminder seed failed with ${response.status}`);
      reminders.push(await response.json());
    }
    return reminders;
  }, { suffix });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Needs attention now')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Reminder urgency chart' })).toBeVisible();
  await expect(page.locator('.urgency-chart svg')).toBeVisible();
  const firstAttentionRow = page.locator('.attention-list__row')
    .filter({ hasText: `Dashboard deadline ${suffix}-20` });
  await expect(firstAttentionRow).toContainText('Scheduled:');
  const firstTimelineLabel = page.locator('.timeline-items [data-day-position="1"]')
    .filter({ hasText: `Dashboard deadline ${suffix}-20` });
  await expect(firstTimelineLabel).toHaveCount(1);
  for (let day = 20; day <= 26; day += 1) {
    await expect(page.locator('.timeline-items').getByText(`Dashboard deadline ${suffix}-${day}`)).toBeAttached();
  }
  await page.getByText('View outcome data').click();
  await expect(page.getByRole('table', { name: 'Completed and renewed reminder data' })).toBeVisible();
  await expect(page.getByRole('link', { name: /add reminder/i })).toHaveAttribute('href', '/reminders?new=1');

  await page.evaluate(async (cycles) => {
    await Promise.all(cycles.map(({ cycle }) => fetch(`/api/reminders/${cycle.reminder.id}/done`, { method: 'POST' })));
  }, created);
});
