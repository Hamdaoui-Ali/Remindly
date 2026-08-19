import { render, screen } from '@testing-library/react';

import { AppShell } from '@/components/layout/app-shell';

it('marks the current navigation link and exposes the owner footer', () => {
  render(
    <AppShell activePath="/reminders" ownerEmail="owner@example.com">
      <main>content</main>
    </AppShell>,
  );

  expect(screen.getByRole('link', { name: 'Reminders' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByText('owner@example.com')).toBeVisible();
});
