import type {
  IntegrationProgressCursor,
  IntegrationSyncScope,
  ZohoCredentialsInput,
  ZohoIntegrationTypeId,
} from '../../../src/lib/integrations/contracts.ts';

export interface IntegrationSyncPhaseDefinition {
  id: string;
  label: string;
  entityType: string;
  path: string;
  itemKey: string;
  perPage?: number;
}

export interface ZohoPhasePage {
  records: Record<string, unknown>[];
  nextCursor: IntegrationProgressCursor | null;
  page: number;
  perPage: number;
  hasMore: boolean;
}

export interface ZohoConnectionMeta {
  organization_id: string;
  organization_name: string | null;
  module: 'books' | 'inventory';
  api_base_url: string;
  accounts_base_url: string;
}

export class ZohoApiError extends Error {
  status: number;
  code?: string | number;
  payload?: unknown;

  constructor(message: string, status = 500, code?: string | number, payload?: unknown) {
    super(message);
    this.name = 'ZohoApiError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

interface ZohoPageContext {
  page?: number;
  per_page?: number;
  has_more_page?: boolean;
}

interface ZohoRequestInit {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

interface NormalizedZohoCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  accountsBaseUrl: string;
  apiBaseUrl: string;
  module: 'books' | 'inventory';
}

const DEFAULT_PER_PAGE = 200;
const DEFAULT_REGION = 'com';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function buildZohoDomain(region: string | null): string {
  const normalized = (region ?? DEFAULT_REGION).trim().toLowerCase();
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized.replace(/\/+$/, '');
  }
  return `https://www.zohoapis.${normalized}`;
}

function buildAccountsDomain(region: string | null): string {
  const normalized = (region ?? DEFAULT_REGION).trim().toLowerCase();
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized.replace(/\/+$/, '');
  }
  return `https://accounts.zoho.${normalized}`;
}

function normalizeZohoCredentials(
  integrationTypeId: ZohoIntegrationTypeId,
  raw: Record<string, unknown>,
): NormalizedZohoCredentials {
  const clientId = asString(raw.client_id);
  const clientSecret = asString(raw.client_secret);
  const refreshToken = asString(raw.refresh_token);
  const organizationId = asString(raw.organization_id) ?? asString(raw.org_id);

  if (!clientId || !clientSecret || !refreshToken || !organizationId) {
    throw new ZohoApiError(
      'Zoho credentials require client_id, client_secret, refresh_token, and organization_id.',
      400,
    );
  }

  const module = integrationTypeId === 'zoho_inventory' ? 'inventory' : 'books';
  const region = asString(raw.region) ?? asString(raw.dc);
  const accountsBaseUrl = asString(raw.accounts_base_url) ?? buildAccountsDomain(region);
  const apiBaseUrl = asString(raw.api_base_url)
    ?? `${buildZohoDomain(region)}/${module === 'inventory' ? 'inventory/v1' : 'books/v3'}`;

  return {
    clientId,
    clientSecret,
    refreshToken,
    organizationId,
    accountsBaseUrl,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    module,
  };
}

function collectOrganizations(payload: Record<string, unknown>): Record<string, unknown>[] {
  const organizations = payload.organizations;
  return Array.isArray(organizations)
    ? organizations.filter((value): value is Record<string, unknown> => isRecord(value))
    : [];
}

async function parseZohoResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? '';
  const parsed = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;
  const payload = isRecord(parsed) ? parsed : {};

  if (!response.ok) {
    throw new ZohoApiError(
      (asString(payload.message) ?? response.statusText ?? 'Zoho request failed'),
      response.status,
      typeof payload.code === 'string' || typeof payload.code === 'number' ? payload.code : undefined,
      payload,
    );
  }

  if (typeof payload.code === 'number' && payload.code !== 0) {
    throw new ZohoApiError(
      asString(payload.message) ?? 'Zoho request failed',
      response.status || 400,
      payload.code,
      payload,
    );
  }

  return payload;
}

function getPageContext(payload: Record<string, unknown>): ZohoPageContext | null {
  return isRecord(payload.page_context) ? (payload.page_context as ZohoPageContext) : null;
}

function getRecordArray(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = payload[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
}

function nextCursorFromPage(
  phase: IntegrationSyncPhaseDefinition,
  page: number,
  perPage: number,
  pageContext: ZohoPageContext | null,
  recordCount: number,
  since: string | null,
): IntegrationProgressCursor | null {
  const hasMore = typeof pageContext?.has_more_page === 'boolean'
    ? pageContext.has_more_page
    : recordCount >= perPage;

  if (!hasMore) return null;

  return {
    phase: phase.id,
    entity_type: phase.entityType,
    page: (typeof pageContext?.page === 'number' ? pageContext.page : page) + 1,
    per_page: typeof pageContext?.per_page === 'number' ? pageContext.per_page : perPage,
    has_more: true,
    since,
  };
}

export function getZohoPhasePlan(
  integrationTypeId: ZohoIntegrationTypeId,
  scope: IntegrationSyncScope,
): IntegrationSyncPhaseDefinition[] {
  const referencePhases: Record<ZohoIntegrationTypeId, IntegrationSyncPhaseDefinition[]> = {
    zoho_books: [
      { id: 'customers', label: 'Importing customers from Zoho Books', entityType: 'customers', path: '/contacts', itemKey: 'contacts' },
      { id: 'products', label: 'Importing products from Zoho Books', entityType: 'products', path: '/items', itemKey: 'items' },
    ],
    zoho_inventory: [
      { id: 'products', label: 'Importing products from Zoho Inventory', entityType: 'products', path: '/items', itemKey: 'items' },
    ],
  };

  const transactionalPhases: Record<ZohoIntegrationTypeId, IntegrationSyncPhaseDefinition[]> = {
    zoho_books: [
      { id: 'estimates', label: 'Importing estimates from Zoho Books', entityType: 'estimates', path: '/estimates', itemKey: 'estimates' },
      { id: 'orders', label: 'Importing sales orders from Zoho Books', entityType: 'orders', path: '/salesorders', itemKey: 'salesorders' },
      { id: 'invoices', label: 'Importing invoices from Zoho Books', entityType: 'invoices', path: '/invoices', itemKey: 'invoices' },
    ],
    zoho_inventory: [],
  };

  if (scope === 'reference') return referencePhases[integrationTypeId];
  if (scope === 'transactional') return transactionalPhases[integrationTypeId];
  return [...referencePhases[integrationTypeId], ...transactionalPhases[integrationTypeId]];
}

export function sampleExternalIds(records: Record<string, unknown>[]): string[] {
  const keys = ['contact_id', 'item_id', 'invoice_id', 'estimate_id', 'salesorder_id', 'organization_id', 'id'];
  const samples: string[] = [];

  for (const record of records) {
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) {
        samples.push(value);
        break;
      }
    }

    if (samples.length >= 5) break;
  }

  return samples;
}

export function createZohoAdapter(
  integrationTypeId: ZohoIntegrationTypeId,
  rawCredentials: Record<string, unknown>,
) {
  const credentials = normalizeZohoCredentials(integrationTypeId, rawCredentials);
  let cachedToken: string | null = null;

  async function refreshAccessToken(): Promise<string> {
    const url = new URL('/oauth/v2/token', credentials.accountsBaseUrl);
    url.searchParams.set('grant_type', 'refresh_token');
    url.searchParams.set('client_id', credentials.clientId);
    url.searchParams.set('client_secret', credentials.clientSecret);
    url.searchParams.set('refresh_token', credentials.refreshToken);

    const response = await fetch(url.toString(), { method: 'POST' });
    const payload = await parseZohoResponse(response);
    const accessToken = asString(payload.access_token);

    if (!accessToken) {
      throw new ZohoApiError('Zoho refresh response did not include an access_token.', response.status, undefined, payload);
    }

    cachedToken = accessToken;
    return accessToken;
  }

  async function request<T extends Record<string, unknown> = Record<string, unknown>>(
    init: ZohoRequestInit,
    retryOnUnauthorized = true,
  ): Promise<T> {
    const token = cachedToken ?? await refreshAccessToken();
    const url = new URL(init.path.replace(/^\/+/, ''), `${credentials.apiBaseUrl}/`);
    const query = init.query ?? {};

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    if (!url.searchParams.has('organization_id')) {
      url.searchParams.set('organization_id', credentials.organizationId);
    }

    const response = await fetch(url.toString(), {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    if (response.status === 401 && retryOnUnauthorized) {
      cachedToken = null;
      await refreshAccessToken();
      return request<T>(init, false);
    }

    return await parseZohoResponse(response) as T;
  }

  async function testConnection(): Promise<ZohoConnectionMeta> {
    const payload = await request({ path: '/organizations' });
    const organizations = collectOrganizations(payload);
    const matched = organizations.find((organization) => {
      const id = asString(organization.organization_id);
      return id === credentials.organizationId;
    }) ?? organizations[0] ?? null;

    return {
      organization_id: credentials.organizationId,
      organization_name: matched ? asString(matched.name) ?? asString(matched.organization_name) : null,
      module: credentials.module,
      api_base_url: credentials.apiBaseUrl,
      accounts_base_url: credentials.accountsBaseUrl,
    };
  }

  async function fetchPhasePage(
    phase: IntegrationSyncPhaseDefinition,
    cursor: IntegrationProgressCursor | null,
    since: string | null,
  ): Promise<ZohoPhasePage> {
    const page = cursor?.page ?? 1;
    const perPage = cursor?.per_page ?? phase.perPage ?? DEFAULT_PER_PAGE;
    const payload = await request({
      path: phase.path,
      query: {
        page,
        per_page: perPage,
      },
    });

    const records = getRecordArray(payload, phase.itemKey);
    const pageContext = getPageContext(payload);
    const nextCursor = nextCursorFromPage(phase, page, perPage, pageContext, records.length, since);

    return {
      records,
      nextCursor,
      page,
      perPage,
      hasMore: nextCursor !== null,
    };
  }

  return {
    provider: 'zoho' as const,
    integrationTypeId,
    credentials,
    testConnection,
    fetchPhasePage,
  };
}

export type ZohoAdapter = ReturnType<typeof createZohoAdapter>;
export type { ZohoCredentialsInput };
