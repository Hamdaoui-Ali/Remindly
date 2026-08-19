import { expect, test } from '@playwright/test';

test('adds, edits, renews, and completes a reminder', async ({ page }) => {
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? 'owner@example.com';
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'correct-password';
  const suffix = Date.now();
  const originalName = `Passport renewal ${suffix}`;
  const renewedName = `Passport renewal next cycle ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Email').fill(ownerEmail);
  await page.getByLabel('Password').fill(ownerPassword);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.getByRole('link', { name: 'Reminders' }).click();

  await page.getByRole('button', { name: /add reminder/i }).click();
  await page.getByLabel('Name').fill(originalName);
  await page.getByLabel('End date').fill('2027-06-30');
  await page.getByLabel('Remind me').selectOption('7');
  await page.getByLabel('At', { exact: true }).fill('09:00');
  await page.getByRole('button', { name: /save reminder/i }).click();

  await expect(page.getByText(originalName)).toBeVisible();
  await expect(page.getByRole('article', { name: originalName })).toContainText(/scheduled email/i);
  const originalRow = page.getByRole('article', { name: originalName });
  await originalRow.getByRole('button', { name: /actions/i }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('End date').fill('2027-07-31');
  await page.getByLabel('Remind me').selectOption('14');
  await page.getByLabel('At', { exact: true }).fill('10:30');
  await page.getByRole('button', { name: /save changes/i }).click();
  await expect(page.getByRole('article', { name: originalName })).toContainText(/Jul 17, 2027, 10:30 AM/i);

  const editedRow = page.getByRole('article', { name: originalName });
  await editedRow.getByRole('button', { name: /actions/i }).click();
  await page.getByRole('button', { name: 'Renew', exact: true }).click();
  await page.getByLabel('Name').fill(renewedName);
  await page.getByLabel('End date').fill('2028-07-31');
  await page.getByRole('button', { name: 'Renew reminder', exact: true }).click();
  await expect(page.getByText(renewedName)).toBeVisible();
  await expect(page.getByText(originalName)).not.toBeVisible();

  const renewedRow = page.getByRole('article', { name: renewedName });
  await renewedRow.getByRole('button', { name: /actions/i }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /mark done/i }).click();
  await expect(page.getByText(renewedName)).not.toBeVisible();
});
