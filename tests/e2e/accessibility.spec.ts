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

test('core pages expose keyboard and screen-reader equivalents', async ({ page }) => {
  await loginAsOwner(page);

  await expect(page.getByRole('navigation', { name: 'Remindly sections' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Reminder urgency chart' })).toBeVisible();
  await expect(page.getByText('View urgency data')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Completed versus renewed chart' })).toBeVisible();

  await page.getByRole('link', { name: 'Reminders', exact: true }).click();
  await openAddReminder(page);
  await expect(page.getByRole('dialog', { name: /add reminder/i })).toBeVisible();
  await expect(page.getByLabel('Name')).toBeVisible();
  await expect(page.getByLabel('End date')).toBeVisible();
  await expect(page.getByLabel('Remind me')).toBeVisible();
  await expect(page.getByLabel('At', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /add reminder/i })).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const menuButton = page.getByRole('button', { name: /open navigation/i });
  await menuButton.click();
  await expect(page.getByRole('dialog', { name: /navigation/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menuButton).toBeFocused();
});
