import { expect, test } from '@playwright/test';

test('redirects a visitor to login and protects the dashboard', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
});

test('shows one generic error when owner authentication fails', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('other@example.com');
  await page.getByLabel('Password').fill('incorrect-password');
  await page.getByRole('button', { name: /sign in/i }).click();

  const loginError = page.getByText('Unable to sign in with those credentials.', {
    exact: true,
  });
  await expect(loginError).toBeVisible();
  await expect(loginError).toHaveAttribute('role', 'alert');
  await expect(page.getByLabel('Email')).toBeFocused();
});

test('returns unauthorized JSON for a protected API request', async ({ request }) => {
  const response = await request.get('/api/private-probe');

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
});

test('signs the owner in with an HTTP-only session cookie', async ({ page }) => {
  const authCallbackRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/auth/callback/credentials')) {
      authCallbackRequests.push(request.url());
    }
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_OWNER_EMAIL ?? 'owner@example.com');
  await page
    .getByLabel('Password')
    .fill(process.env.E2E_OWNER_PASSWORD ?? 'correct-password');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL('/');
  expect(authCallbackRequests).toHaveLength(1);
  const sessionCookie = (await page.context().cookies()).find(({ name }) =>
    name.endsWith('remindly.session-token'),
  );
  expect(sessionCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
});
