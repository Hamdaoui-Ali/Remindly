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
  const initialAlertTime = await alertTime.inputValue();
  const changedAlertTime = initialAlertTime === '10:30' ? '09:00' : '10:30';
  await expect(async () => {
    await alertTime.fill(changedAlertTime);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(alertTime).toHaveValue(initialAlertTime, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  await alertTime.fill(changedAlertTime);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
  await page.reload();
  await expect(alertTime).toHaveValue(changedAlertTime);

  await alertTime.fill(initialAlertTime);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(/settings saved/i)).toBeVisible();
});
