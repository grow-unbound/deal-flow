export type AnalyticsRouteInfo = {
  page_area: 'seller' | 'buyer' | 'auth' | 'guest' | 'public';
  page_name: string;
  route_pattern: string;
};

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeSegment(segment: string): string {
  if (UUID_SEGMENT.test(segment)) return '[id]';
  if (/^\d+$/.test(segment)) return '[id]';
  if (segment.length > 24 && /^[a-zA-Z0-9_-]+$/.test(segment)) return '[token]';
  return segment;
}

export function getAnalyticsRouteInfo(pathname: string | null): AnalyticsRouteInfo {
  const path = pathname || '/';
  const segments = path.split('/').filter(Boolean);
  const routePattern = `/${segments.map(normalizeSegment).join('/')}`;
  const route_pattern = routePattern === '/' ? '/' : routePattern;

  const page_area: AnalyticsRouteInfo['page_area'] =
    segments[0] === 'buy'
      ? 'buyer'
      : segments[0] === 'login'
        || segments[0] === 'signup'
        || segments[0] === 'verify'
        || segments[0] === 'verify-account'
        || segments[0] === 'forgot-password'
        || segments[0] === 'reset-password'
        || segments[0] === 'accept-invite'
        || segments[0] === 'setup-password'
        || segments[0] === 'activate'
        ? 'auth'
        : segments[0] === 'c'
          ? 'guest'
          : segments.length === 0
            ? 'public'
            : 'seller';

  return {
    page_area,
    page_name: route_pattern === '/' ? 'home' : segments.map(normalizeSegment).join('/'),
    route_pattern,
  };
}
