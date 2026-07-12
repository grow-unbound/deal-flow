'use client';

import { ShieldOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function PermissionDenied() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-cream-50 px-4">
      <Card className="max-w-sm w-full border-cream-300 shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-cream-200 flex items-center justify-center">
            <ShieldOff size={20} className="text-cream-600" />
          </div>
          <div>
            <h2 className="text-h3 font-display text-cream-900 mb-1">No access</h2>
            <p className="text-body-sm text-cream-600">
              You don&apos;t have permission to access this page.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
