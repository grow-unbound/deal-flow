'use client';

import type { ReactNode } from 'react';
import { CardEmptyState } from './CardEmptyState';
import type {
  DetailCardPayload,
  DetailDistributionCardBody,
  DetailEmptyCardBody,
  DetailMetricGridCardBody,
  DetailRankedListCardBody,
  DetailTrendCardBody,
} from './detail-card-types';
import { DistributionList } from './DistributionList';
import { MetricGrid } from './MetricGrid';
import { PerformanceCard, type PerformanceCardProps } from './PerformanceCard';
import { RankedList } from './RankedList';
import { TrendFrame } from './TrendFrame';

export interface DetailCardRendererProps extends Pick<PerformanceCardProps, 'className' | 'bodyClassName'> {
  card: DetailCardPayload;
  actions?: ReactNode;
}

export function DetailCardRenderer({
  card,
  actions,
  className,
  bodyClassName,
}: DetailCardRendererProps) {
  const isUnavailable = card.representation === 'unavailable' || card.availability === 'unavailable';

  return (
    <PerformanceCard
      className={className}
      title={card.title}
      subtitle={card.subtitle}
      actions={actions}
      bodyClassName={bodyClassName ?? 'p-0'}
    >
      {renderCardBody(card, isUnavailable)}
    </PerformanceCard>
  );
}

function renderCardBody(card: DetailCardPayload, isUnavailable: boolean) {
  if (card.representation === 'trend') {
    const body = card.body as DetailTrendCardBody;
    return (
      <TrendFrame
        emptyTitle={body.emptyTitle}
        emptyDescription={body.emptyDescription}
        summary={body.summary}
        controls={body.controls}
        chart={body.chart}
      />
    );
  }

  if (card.representation === 'ranked_list') {
    const body = card.body as DetailRankedListCardBody;
    return (
      <RankedList
        items={body.items}
        emptyTitle={body.emptyTitle}
        emptyDescription={body.emptyDescription}
        compact={body.compact}
      />
    );
  }

  if (card.representation === 'distribution' || card.representation === 'mix') {
    const body = card.body as DetailDistributionCardBody;
    return (
      <DistributionList
        items={body.items}
        emptyTitle={body.emptyTitle}
        emptyDescription={body.emptyDescription}
        compact={body.compact}
        mode={card.representation === 'mix' ? 'mix' : (body.mode ?? 'distribution')}
      />
    );
  }

  if (card.representation === 'posture') {
    const body = card.body as DetailMetricGridCardBody;
    return (
      <div className="p-5">
        <MetricGrid className="mt-0" tiles={body.tiles} showSupportingText={body.showSupportingText} />
      </div>
    );
  }

  const body = card.body as DetailEmptyCardBody;
  return (
    <div className="p-5">
      <CardEmptyState
        title={body.title}
        description={body.description}
        tone={isUnavailable ? 'unavailable' : (body.tone ?? 'empty')}
        compact={body.compact}
      />
    </div>
  );
}
