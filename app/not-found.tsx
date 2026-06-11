import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-cream-50 px-4 py-12">
      <EmptyState
        icon={<FileQuestion size={28} strokeWidth={1.5} />}
        heading="Page not found"
        description="The link may be broken or the page was removed."
        action={
          <Button asChild variant="accent">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </div>
  );
}
