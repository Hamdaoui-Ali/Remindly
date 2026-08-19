import { render, screen } from '@testing-library/react';
import HomePage from '@/app/(protected)/page';

it('renders the Remindly loading shell', () => {
  render(<HomePage />);
  expect(screen.getByText('Remindly')).toBeVisible();
});
