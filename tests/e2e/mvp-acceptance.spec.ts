import { expect, test } from '@playwright/test';

async function loginAsOwner(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL ?? 'owner@example.com');
  await page.getByLabel('Password').fill(
    process.env.E2E_OWNER_PASSWORD ?? 'correct-password',
  );
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('/');
}

async function openAddReminder(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: /add reminder/i });
  await expect(async () => {
    await page.getByRole('button', { name: /add reminder/i }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test('owner completes the MVP reminder lifecycle', async ({ page, request }) => {
  const name = `Passport renewal acceptance ${Date.now()}`;

  const health = await request.get('/api/health');
  expect(health.status()).toBe(200);
  await expect(health.json()).resolves.toEqual({ status: 'ok', database: 'ok' });

  const unauthorizedScheduler = await request.post(
    '/api/internal/process-due-notifications',
  );
  expect(unauthorizedScheduler.status()).toBe(401);
  await expect(unauthorizedScheduler.json()).resolves.toEqual({ error: 'Unauthorized' });

  await loginAsOwner(page);
  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await openAddReminder(page);
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('End date').fill('2026-12-01');
  await page.getByLabel('Remind me').selectOption('14');
  await page.getByLabel('At', { exact: true }).fill('09:00');
  await page.getByRole('button', { name: /save reminder/i }).click();

  const reminder = page.getByRole('article', { name });
  await expect(reminder).toBeVisible();
  await expect(reminder).toContainText('Safe');
  await expect(reminder).toContainText(/scheduled email/i);

  await reminder.getByRole('button', { name: /actions/i }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /mark done/i }).click();
  await expect(page.getByRole('article', { name })).not.toBeVisible();

  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});
