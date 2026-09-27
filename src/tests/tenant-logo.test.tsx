import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ImgHTMLAttributes } from 'react';
import { TenantLogo } from '@/components/brand/TenantLogo';

vi.mock('next/image', () => ({
  default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} />,
}));

describe('TenantLogo', () => {
  it('renders an uploaded tenant logo when one is available', () => {
    render(<TenantLogo name="WineYard" logoUrl=" https://assets.yukti.so/tenants/wineyard/logo.webp " />);

    const logo = screen.getByRole('img', { name: 'WineYard logo' });
    expect(logo).toBeInstanceOf(HTMLImageElement);
    expect(logo).toHaveAttribute('src', 'https://assets.yukti.so/tenants/wineyard/logo.webp');
  });

  it('falls back to initials when a tenant logo is missing', () => {
    render(<TenantLogo name="WineYard Distribution" logoUrl={null} />);

    const fallback = screen.getByRole('img', { name: 'WineYard Distribution logo' });
    expect(fallback).not.toBeInstanceOf(HTMLImageElement);
    expect(fallback).toHaveTextContent('WD');
  });
});
