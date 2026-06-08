import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { SellerGlobalHeader, NotificationsBell } from '@/components/layout/SellerGlobalHeader';

describe('SellerGlobalHeader', () => {
  it('renders notifications link to /notifications before Open buyer app', () => {
    render(<SellerGlobalHeader />);

    const links = screen.getAllByRole('link');
    const notif = links.find((l) => l.getAttribute('href') === '/notifications');
    expect(notif).toBeTruthy();
    expect(notif).toHaveAttribute('aria-label', 'Notifications');

    const buyer = screen.getByRole('link', { name: /Open buyer app/i });
    expect(buyer).toHaveAttribute('href', '/api/buyer/preview/launch');
    expect(buyer).toHaveAttribute('target', '_blank');

    expect(links.indexOf(notif!)).toBeLessThan(links.indexOf(buyer));
  });

  it('shows unread badge only when unreadCount > 0', () => {
    const { rerender } = render(<NotificationsBell unreadCount={0} />);
    expect(screen.queryByText('3')).not.toBeInTheDocument();

    rerender(<NotificationsBell unreadCount={3} />);
    const badge = screen.getByText('3');
    expect(badge).toHaveClass('bg-ember-500');
    expect(badge).toHaveClass('text-white');
    expect(badge).toHaveClass('text-[9px]');
    expect(badge).toHaveClass('font-bold');
  });

  it('caps badge label at 99+', () => {
    render(<NotificationsBell unreadCount={120} />);
    expect(screen.getByText('99+')).toBeInTheDocument();
  });
});
