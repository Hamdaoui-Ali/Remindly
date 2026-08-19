import { expect, test } from '@playwright/test';

test('owner updates settings, cancels edits, and sees protected access', async ({ page }) => {
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'owner@example.com';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'correct-password';

  await page.goto('/login');
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password').fill(ownerPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('link', { name: 'Settings' }).click();

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText(/protected access/i)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /password/i })).toHaveCount(0);

  const alertTime = page.getByLabel('Default alert time');
  await alertTime.fill('10:30');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(alertTime).toHaveValue('09:00');

  await alertTime.fill('10:30');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
  await page.reload();
  await expect(alertTime).toHaveValue('10:30');

  await alertTime.fill('09:00');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
});
