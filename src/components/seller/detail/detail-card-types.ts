import type { ReactNode } from 'react';
import type { DistributionListItem } from './DistributionList';
import type { MetricTile } from './MetricGrid';
import type { RankedListItem } from './RankedList';

export type DetailCardRepresentation =
  | 'trend'
  | 'ranked_list'
  | 'distribution'
  | 'mix'
  | 'posture'
  | 'empty'
  | 'unavailable';

export interface DetailCardPayload<TBody = unknown> {
  id?: string;
  representation: DetailCardRepresentation;
  title: string;
  subtitle?: string;
  time_basis?: string;
  availability?: 'ready' | 'conditional' | 'unavailable';
  body: TBody;
}

export interface DetailCardMetricRow {
  id: string;
  label: string;
  value: ReactNode;
  supporting?: ReactNode;
}

export interface DetailTrendCardBody {
  emptyTitle: string;
  emptyDescription?: ReactNode;
  summary?: ReactNode;
  controls?: ReactNode;
  chart?: ReactNode;
}

export interface DetailRankedListCardBody {
  items: RankedListItem[];
  emptyTitle: string;
  emptyDescription?: ReactNode;
  compact?: boolean;
}

export interface DetailDistributionCardBody {
  items: DistributionListItem[];
  emptyTitle: string;
  emptyDescription?: ReactNode;
  compact?: boolean;
  mode?: 'distribution' | 'mix';
}

export interface DetailMetricGridCardBody {
  tiles: MetricTile[];
  showSupportingText?: boolean;
  columns?: 'auto' | 'two-by-two';
}

export interface DetailEmptyCardBody {
  title: string;
  description?: ReactNode;
  tone?: 'empty' | 'unavailable' | 'error';
  compact?: boolean;
}

export type DetailCardBody =
  | DetailTrendCardBody
  | DetailRankedListCardBody
  | DetailDistributionCardBody
  | DetailMetricGridCardBody
  | DetailEmptyCardBody;
