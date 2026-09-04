'use client';

import { usePathname } from 'next/navigation';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StorefrontPhoneLogin } from '@/components/buyer/auth/StorefrontPhoneLogin';
import { useStorefrontLogin } from '@/contexts/StorefrontLoginContext';

export function StorefrontLoginOverlay() {
  const { loginOpen, closeLogin } = useStorefrontLogin();
  const pathname = usePathname();

  return (
    <Dialog open={loginOpen} onOpenChange={(open) => { if (!open) closeLogin(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log in</DialogTitle>
          <DialogDescription>Use WhatsApp OTP to continue on this store.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <StorefrontPhoneLogin nextPath={pathname || '/'} compact />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
