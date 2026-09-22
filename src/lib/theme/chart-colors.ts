import { colors } from './tokens';

// Recharts consumes literal color strings (fill/stroke/tick/cursor props), not
// Tailwind classes or CSS custom properties, so chart colors can't reference
// the --yk-*/--cream-* tokens directly. These constants exist so every chart
// pulls from one place instead of each component hand-copying its own hex
// array — keeps palettes consistent and makes future retheming a one-file change.

/** Categorical palette for donut/pie/multi-series charts (8 muted hues). */
export const CHART_CATEGORICAL_PALETTE = [
  '#204A41', '#B7703D', '#A59984', '#C07A43', '#6E8F87', '#8C6B4F', '#4C7A6E', '#D9A066',
] as const;

/** 5-color palette for distribution/composition charts — variant B (warmer, buyer-app context). */
export const CHART_DISTRIBUTION_PALETTE_WARM = [
  '#346A5C', '#7EA89A', '#D9C6B4', '#C26E3A', '#E7D8CB',
] as const;

/** Funnel-chart palette (5 steps, dark-to-light). */
export const CHART_FUNNEL_PALETTE = [
  '#204A41', '#3B6659', '#57816F', '#7EA89A', '#A8C7BC',
] as const;

/** Axis tick label font size (px) — Recharts `tick` takes a numeric literal, not a class. */
export const CHART_TICK_FONT_SIZE = 11;

/** Axis tick label color — unifies two slightly-drifted greys previously
 * hardcoded separately in Location and Category detail tabs (#8A7E74 vs #9B9285). */
export const CHART_AXIS_TICK_COLOR = '#8A7E74';

/** Tooltip border/cursor — nearest existing cream tokens, so chart chrome tracks the palette. */
export const CHART_TOOLTIP_BORDER_COLOR = colors.cream[300];
export const CHART_TOOLTIP_CURSOR_FILL = colors.cream[100];

/** Bar accent — no matching brand token exists (brand palette is Charcoal + Copper
 * only); kept as a literal but centralized here instead of duplicated per file. */
export const CHART_BAR_ACCENT = '#0D9488';

/** Trend-chart highlight (most recent bar) vs muted (earlier bars). */
export const CHART_TREND_HIGHLIGHT = '#346A5C';
export const CHART_TREND_MUTED = '#C5DDD8';
