import { useContext, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { EntityAvatar, type EntityAvatarHue, StatusTag, type StatusTone } from '@/components/seller/layout';
import { SplitPaneCloseContext } from '@/components/seller/layout/EntitySplitShell';
import { Skeleton } from '@/components/ui/skeleton';

interface DetailAvatar {
  kind: 'brand' | 'product' | 'catalog' | 'customer' | 'warehouse' | 'location' | 'category' | 'cohort' | 'price-list' | 'campaign' | 'generic';
  initials?: string;
  hue?: EntityAvatarHue;
  imageUrl?: string | null;
}

interface DetailStatus {
  label: string;
  tone: StatusTone;
}

interface DetailHeaderProps {
  avatar: DetailAvatar;
  title: string;
  status: DetailStatus;
  subtitle: ReactNode[];
  statusActions?: ReactNode;
  actions: ReactNode;
  /** While true, title/status/subtitle render as skeleton placeholders instead of the (possibly not-yet-loaded) props. */
  loading?: boolean;
}

function renderAvatar(avatar: DetailAvatar) {
  if (avatar.kind !== 'product' && avatar.kind !== 'catalog') {
    return <EntityAvatar initials={avatar.initials ?? 'BR'} hue={avatar.hue ?? 'cream'} imageUrl={avatar.imageUrl} size={48} className="rounded-[14px]" />;
  }

  if (avatar.kind === 'catalog') {
    return <EntityAvatar initials={avatar.initials ?? 'CT'} hue="ember" imageUrl={avatar.imageUrl} size={48} className="rounded-[14px]" />;
  }

  return (
    <div className="inline-flex h-12 w-12 shrink-0 items-end justify-center rounded-[14px] border border-teal-200 bg-gradient-to-b from-teal-50 to-teal-100 pb-[6px]">
      <div className="h-[24px] w-[9px] rounded-t-[3px] rounded-b-[2px] bg-gradient-to-b from-teal-500 to-teal-700" />
    </div>
  );
}

export function DetailHeader({ avatar, title, status, subtitle, statusActions, actions, loading }: DetailHeaderProps) {
  const closePane = useContext(SplitPaneCloseContext);
  return (
    <header>
      <div className="flex items-start justify-between gap-4 md:gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {renderAvatar(avatar)}
            <div className="min-w-0">
              {loading ? (
                <>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="mt-2 h-4 w-64" />
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-display text-lg font-extrabold leading-[1.05] tracking-[-0.025em] text-cream-950 md:text-xl">{title}</h1>
                    <StatusTag label={status.label} tone={status.tone} />
                    {statusActions ? <div className="ml-1 inline-flex items-center gap-1">{statusActions}</div> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[var(--b-text-sub)] font-medium leading-5 tracking-[-0.01em] text-cream-500 md:text-base md:font-normal md:tracking-0 md:text-cream-700">
                    {subtitle.map((item, index) => (
                      <div key={index} className="inline-flex items-center gap-1.5">
                        {index > 0 ? <span className="text-cream-500">·</span> : null}
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {actions}
          {closePane ? (
            <button
              type="button"
              onClick={closePane}
              aria-label="Close detail pane"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cream-300 bg-white text-cream-600 shadow-sm transition-colors hover:bg-cream-100 hover:text-cream-900"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export type { DetailAvatar, DetailStatus, DetailHeaderProps };
