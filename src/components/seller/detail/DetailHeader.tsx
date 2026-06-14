import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { EntityAvatar, type EntityAvatarHue, StatusTag, type StatusTone } from '@/components/seller/layout';

interface CrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface DetailAvatar {
  kind: 'brand' | 'product' | 'catalog';
  initials?: string;
  hue?: EntityAvatarHue;
}

interface DetailStatus {
  label: string;
  tone: StatusTone;
}

interface DetailHeaderProps {
  crumbPath: CrumbItem[];
  avatar: DetailAvatar;
  title: string;
  status: DetailStatus;
  subtitle: ReactNode[];
  statusActions?: ReactNode;
  actions: ReactNode;
}

function renderAvatar(avatar: DetailAvatar) {
  if (avatar.kind === 'brand') {
    return <EntityAvatar initials={avatar.initials ?? 'BR'} hue={avatar.hue ?? 'cream'} size={48} className="rounded-[14px]" />;
  }

  if (avatar.kind === 'catalog') {
    return (
      <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-ember-200 bg-ember-100 font-display text-md font-semibold uppercase text-ember-800">
        {avatar.initials ?? 'CT'}
      </div>
    );
  }

  return (
    <div className="inline-flex h-12 w-12 shrink-0 items-end justify-center rounded-[14px] border border-teal-200 bg-gradient-to-b from-teal-50 to-teal-100 pb-[6px]">
      <div className="h-[24px] w-[9px] rounded-t-[3px] rounded-b-[2px] bg-gradient-to-b from-teal-500 to-teal-700" />
    </div>
  );
}

export function DetailHeader({ crumbPath, avatar, title, status, subtitle, statusActions, actions }: DetailHeaderProps) {
  return (
    <header>
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-cream-600">
        {crumbPath.map((crumb, index) => {
          const isCurrent = crumb.current || index === crumbPath.length - 1;
          return (
            <div key={`${crumb.label}-${index}`} className="inline-flex items-center gap-1.5">
              {index > 0 ? <span className="text-cream-400">›</span> : null}
              {crumb.href && !isCurrent ? (
                <Link href={crumb.href} className="hover:text-cream-900">
                  {crumb.label}
                </Link>
              ) : (
                <span className={cn(isCurrent && 'font-medium text-cream-900')}>{crumb.label}</span>
              )}
            </div>
          );
        })}
      </nav>

      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {renderAvatar(avatar)}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-extrabold tracking-[-0.025em] text-cream-950 leading-[1.05]">{title}</h1>
                <StatusTag label={status.label} tone={status.tone} />
                {statusActions ? <div className="ml-1 inline-flex items-center gap-1">{statusActions}</div> : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-base text-cream-700">
                {subtitle.map((item, index) => (
                  <div key={index} className="inline-flex items-center gap-1.5">
                    {index > 0 ? <span className="text-cream-500">·</span> : null}
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}

export type { CrumbItem, DetailAvatar, DetailStatus, DetailHeaderProps };
