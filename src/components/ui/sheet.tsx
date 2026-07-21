'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { BUYER_PREVIEW_MAX_WIDTH } from '@/lib/buyer-preview';
import { cn } from '@/lib/cn';

const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-cream-900/40 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out',
      'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = 'SheetOverlay';

const sheetVariants = cva(
  'fixed z-50 flex flex-col bg-white shadow-xl transition ease-emphasis',
  {
    variants: {
      side: {
        right:  'inset-y-0 right-0 h-full w-full max-w-sm border-l border-cream-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right duration-slow',
        left:   'inset-y-0 left-0 h-full w-full max-w-sm border-r border-cream-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-slow',
        bottom: 'relative w-full border-t border-cream-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-500',
      },
    },
    defaultVariants: { side: 'right' },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  showCloseButton?: boolean;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, showCloseButton = true, ...props }, ref) => {
  const content = (
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ember-400 focus:ring-offset-2">
          <X className="h-5 w-5 text-cream-700" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      ) : null}
    </DialogPrimitive.Content>
  );

  if (side === 'bottom') {
    return (
      <SheetPortal>
        <SheetOverlay />
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center md:px-4">
          <div
            className="w-full pointer-events-auto"
            style={{ maxWidth: BUYER_PREVIEW_MAX_WIDTH }}
          >
            {content}
          </div>
        </div>
      </SheetPortal>
    );
  }

  return (
    <SheetPortal>
      <SheetOverlay />
      {content}
    </SheetPortal>
  );
});
SheetContent.displayName = 'SheetContent';

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-5 py-4 border-b border-cream-200', className)} {...props} />
);

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-h4 font-sans font-semibold text-cream-900', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('min-h-0 flex-1 overflow-y-auto px-[22px] py-[20px]', className)} {...props} />
));
SheetBody.displayName = 'SheetBody';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-shrink-0 flex flex-row items-center gap-2 border-t border-cream-300 bg-cream-50 px-[22px] py-[14px]', className)} {...props} />
);

export { Sheet, SheetTrigger, SheetClose, SheetPortal, SheetOverlay, SheetContent, SheetHeader, SheetTitle, SheetBody, SheetFooter };
