import { expect, test } from '@playwright/test';

test('owner sees the operational dashboard and accessible chart fallbacks', async ({ page }) => {
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'owner@example.com';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'correct-password';

  await page.goto('/login');
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password').fill(ownerPassword);
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Needs attention now')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Reminder urgency chart' })).toBeVisible();
  await expect(page.locator('.urgency-chart svg')).toBeVisible();
  await page.getByText('View outcome data').click();
  await expect(page.getByRole('table', { name: 'Completed and renewed reminder data' })).toBeVisible();
  await expect(page.getByRole('link', { name: /add reminder/i })).toHaveAttribute('href', '/reminders?new=1');
});
