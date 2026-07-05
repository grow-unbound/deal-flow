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

export interface ZohoTokenCacheProvider {
  read(): Promise<string | null>;
  write(token: string, expiresAt: Date): Promise<void>;
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
  baseUrl?: string;
}

interface NormalizedZohoCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  organizationId: string;
  accountsBaseUrl: string;
  apiBaseUrl: string;
  warehouseApiBaseUrl: string;
  module: 'books' | 'inventory';
}

const DEFAULT_PER_PAGE = 200;
const DEFAULT_REGION = 'in';

const TRANSACTIONAL_ENTITY_TYPES = new Set(['estimates', 'orders', 'invoices']);
// Zoho supports last_modified_time filter on these endpoints; locations and pricelists always do full fetch
const LAST_MODIFIED_SUPPORTED_TYPES = new Set(['products', 'customers', 'estimates', 'orders', 'invoices']);
const PRICE_LIST_RESPONSE_KEYS = ['pricebooks', 'pricelists'] as const;
const ZOHO_REQUEST_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const ZOHO_REQUEST_MAX_ATTEMPTS = 3;
const ZOHO_REQUEST_TIMEOUT_MS = 30_000;

// Indian Financial Year starts April 1. For transactional data we load from:
//   Apr–Jun (early in FY)  → Jan 1 of this calendar year (extra context quarter)
//   Jul–Dec (mid/late FY)  → Apr 1 of this calendar year (FY start)
//   Jan–Mar (FY Q4)        → Apr 1 of previous calendar year (FY start)
function financialYearStart(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const year = now.getFullYear();

  if (month >= 4 && month <= 6) {
    return `${year}-01-01`;
  }
  if (month >= 7) {
    return `${year}-04-01`;
  }
  // January–March: FY started April of last year
  return `${year - 1}-04-01`;
}

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

export function normalizeZohoCredentials(
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
  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
  const warehouseApiBaseUrl = normalizedApiBaseUrl.includes('/inventory/v1')
    ? normalizedApiBaseUrl
    : normalizedApiBaseUrl.includes('/books/v3')
      ? normalizedApiBaseUrl.replace(/\/books\/v3$/, '/inventory/v1')
      : `${buildZohoDomain(region)}/inventory/v1`;

  return {
    clientId,
    clientSecret,
    refreshToken,
    organizationId,
    accountsBaseUrl,
    apiBaseUrl: normalizedApiBaseUrl,
    warehouseApiBaseUrl,
    module,
  };
}

export function extractZohoDcFromAccountsBaseUrl(accountsBaseUrl: string): string {
  const match = accountsBaseUrl.trim().match(/accounts\.zoho\.([a-z.]+)$/i);
  return match?.[1]?.toLowerCase() ?? DEFAULT_REGION;
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

function isRetryableZohoRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('http2 error')
    || message.includes('sendrequest')
    || message.includes('connection error')
    || message.includes('fetch failed')
    || message.includes('network error')
    || message.includes('aborted')
    || message.includes('timeout')
  );
}

function isRetryableZohoResponseStatus(status: number): boolean {
  return ZOHO_REQUEST_RETRYABLE_STATUSES.has(status);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, response?: Response): number {
  // On 429 rate-limit: honour Retry-After header when present (value is seconds)
  if (response?.status === 429) {
    const header = response.headers.get('Retry-After');
    const seconds = header ? parseFloat(header) : NaN;
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
  }
  // Exponential backoff with ±200ms jitter for all other retryable errors
  return 1000 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
}

async function fetchZohoResponse(url: string, init: RequestInit, retryLabel: string): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= ZOHO_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Zoho ${retryLabel} request timed out after ${ZOHO_REQUEST_TIMEOUT_MS}ms.`)), ZOHO_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (attempt < ZOHO_REQUEST_MAX_ATTEMPTS && isRetryableZohoResponseStatus(response.status)) {
        await delay(retryDelayMs(attempt, response));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= ZOHO_REQUEST_MAX_ATTEMPTS || !isRetryableZohoRequestError(error)) {
        throw error;
      }
      await delay(retryDelayMs(attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Zoho ${retryLabel} request failed.`);
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
      { id: 'locations', label: 'Importing locations from Zoho Books', entityType: 'locations', path: '/locations', itemKey: 'locations' },
      { id: 'products', label: 'Importing products from Zoho Books', entityType: 'products', path: '/items', itemKey: 'items' },
      { id: 'pricelists', label: 'Importing pricelists from Zoho Books', entityType: 'pricelists', path: '/pricebooks', itemKey: 'pricebooks' },
      { id: 'customers', label: 'Importing customers from Zoho Books', entityType: 'customers', path: '/contacts', itemKey: 'contacts' },
    ],
    zoho_inventory: [
      { id: 'warehouses', label: 'Importing warehouses from Zoho Inventory', entityType: 'warehouses', path: '/settings/warehouses', itemKey: 'warehouses' },
      { id: 'products', label: 'Importing products from Zoho Inventory', entityType: 'products', path: '/items', itemKey: 'items' },
      { id: 'pricelists', label: 'Importing pricelists from Zoho Inventory', entityType: 'pricelists', path: '/pricebooks', itemKey: 'pricebooks' },
      { id: 'customers', label: 'Importing customers from Zoho Inventory', entityType: 'customers', path: '/contacts', itemKey: 'contacts' },
    ],
  };

  const transactionalPhases: Record<ZohoIntegrationTypeId, IntegrationSyncPhaseDefinition[]> = {
    zoho_books: [
      { id: 'estimates', label: 'Importing estimates from Zoho Books', entityType: 'estimates', path: '/estimates', itemKey: 'estimates' },
      { id: 'orders', label: 'Importing sales orders from Zoho Books', entityType: 'orders', path: '/salesorders', itemKey: 'salesorders' },
      { id: 'invoices', label: 'Importing invoices from Zoho Books', entityType: 'invoices', path: '/invoices', itemKey: 'invoices' },
    ],
    zoho_inventory: [
      { id: 'estimates', label: 'Importing estimates from Zoho Inventory', entityType: 'estimates', path: '/estimates', itemKey: 'estimates' },
      { id: 'orders', label: 'Importing sales orders from Zoho Inventory', entityType: 'orders', path: '/salesorders', itemKey: 'salesorders' },
      { id: 'invoices', label: 'Importing invoices from Zoho Inventory', entityType: 'invoices', path: '/invoices', itemKey: 'invoices' },
    ],
  };

  if (scope === 'reference') return referencePhases[integrationTypeId];
  if (scope === 'transactional') return transactionalPhases[integrationTypeId];
  return [...referencePhases[integrationTypeId], ...transactionalPhases[integrationTypeId]];
}

export function sampleExternalIds(records: Record<string, unknown>[]): string[] {
  const keys = [
    'location_id', 'warehouse_id',
    'contact_id', 'contact_person_id',
    'item_id',
    'estimate_id', 'salesorder_id', 'invoice_id',
    'organization_id', 'id',
  ];
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
  tokenCache?: ZohoTokenCacheProvider,
) {
  const credentials = normalizeZohoCredentials(integrationTypeId, rawCredentials);
  let cachedToken: string | null = null;

  async function refreshAccessToken(): Promise<string> {
    // Check persistent cache first (avoids token refresh on every Edge Function cold-start)
    if (tokenCache) {
      const persisted = await tokenCache.read().catch(() => null);
      if (persisted) {
        cachedToken = persisted;
        return persisted;
      }
    }

    const url = new URL('/oauth/v2/token', credentials.accountsBaseUrl);
    url.searchParams.set('grant_type', 'refresh_token');
    url.searchParams.set('client_id', credentials.clientId);
    url.searchParams.set('client_secret', credentials.clientSecret);
    url.searchParams.set('refresh_token', credentials.refreshToken);

    const response = await fetchZohoResponse(url.toString(), { method: 'POST' }, 'token refresh');
    const payload = await parseZohoResponse(response);
    const accessToken = asString(payload.access_token);

    if (!accessToken) {
      throw new ZohoApiError('Zoho refresh response did not include an access_token.', response.status, undefined, payload);
    }

    cachedToken = accessToken;
    // Zoho access tokens expire in 3600s — cache with 120s buffer so we never use a near-expired token
    if (tokenCache) {
      const expiresAt = new Date(Date.now() + (3600 - 120) * 1000);
      tokenCache.write(accessToken, expiresAt).catch(() => {});
    }
    return accessToken;
  }

  async function request<T extends Record<string, unknown> = Record<string, unknown>>(
    init: ZohoRequestInit,
    retryOnUnauthorized = true,
  ): Promise<T> {
    const token = cachedToken ?? await refreshAccessToken();
    const baseUrl = (init.baseUrl ?? credentials.apiBaseUrl).replace(/\/+$/, '');
    const url = new URL(init.path.replace(/^\/+/, ''), `${baseUrl}/`);
    const query = init.query ?? {};

    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    if (!url.searchParams.has('organization_id')) {
      url.searchParams.set('organization_id', credentials.organizationId);
    }

    const response = await fetchZohoResponse(url.toString(), {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }, init.path);

    if (response.status === 401 && retryOnUnauthorized) {
      cachedToken = null;
      // Evict persisted cache so next call forces a real refresh
      if (tokenCache) tokenCache.write('', new Date(0)).catch(() => {});
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
    jobType?: string,
  ): Promise<ZohoPhasePage> {
    const page = cursor?.page ?? 1;
    const perPage = cursor?.per_page ?? phase.perPage ?? DEFAULT_PER_PAGE;

    // Apply time filters based on entity type and Zoho API support:
    // - Transactional (estimates/orders/invoices): always use date_start
    // - Reference data (products/customers): last_modified_time only on incremental cron jobs;
    //   manual and initial syncs always do a full fetch so reference data is complete
    // - Locations, pricelists, warehouses: always full fetch (Zoho doesn't support these filters)
    const isIncremental = jobType === 'incremental';
    const dateStart = TRANSACTIONAL_ENTITY_TYPES.has(phase.entityType)
      ? (since ?? financialYearStart())
      : undefined;
    const lastModifiedDate = !TRANSACTIONAL_ENTITY_TYPES.has(phase.entityType) &&
      LAST_MODIFIED_SUPPORTED_TYPES.has(phase.entityType) &&
      since != null &&
      isIncremental
      ? since
      : undefined;
    // Zoho requires last_modified_time as "YYYY-MM-DDTHH:mm:ss+0530" (IST) — not a bare date
    const lastModified = lastModifiedDate ? `${lastModifiedDate}T00:00:00+0530` : undefined;

    const query = {
      page,
      per_page: perPage,
      ...(dateStart ? { date_start: dateStart } : {}),
      ...(lastModified ? { last_modified_time: lastModified } : {}),
    };
    const baseUrl = phase.entityType === 'warehouses'
      ? credentials.warehouseApiBaseUrl
      : credentials.apiBaseUrl;
    let payload: Record<string, unknown>;
    if (phase.id === 'pricelists') {
      payload = await requestPricelistsPage(query);
    } else {
      payload = await request({
        path: phase.path,
        query,
        baseUrl,
      });
    }

    const records = phase.id === 'pricelists'
      ? getPriceListRecords(payload)
      : getRecordArray(payload, phase.itemKey);
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

  async function fetchContactPersons(contactId: string): Promise<Record<string, unknown>[]> {
    const payload = await request({
      path: `/contacts/${contactId}/contactpersons`,
    });
    return getRecordArray(payload, 'contact_persons');
  }

  async function fetchContactById(contactId: string): Promise<Record<string, unknown> | null> {
    try {
      const payload = await request({ path: `/contacts/${contactId}` });
      const contact = payload.contact;
      return isRecord(contact) ? contact : null;
    } catch {
      return null;
    }
  }

  async function fetchItemById(itemId: string): Promise<Record<string, unknown> | null> {
    try {
      const payload = await request({ path: `/items/${itemId}` });
      const item = payload.item;
      return isRecord(item) ? item : null;
    } catch {
      return null;
    }
  }

  async function fetchLocationById(locationId: string): Promise<Record<string, unknown> | null> {
    try {
      const path = credentials.module === 'inventory'
        ? `/settings/warehouses/${locationId}`
        : `/locations/${locationId}`;
      const payload = await request({
        path,
        baseUrl: credentials.module === 'inventory' ? credentials.warehouseApiBaseUrl : credentials.apiBaseUrl,
      });
      const location = payload.warehouse ?? payload.location;
      return isRecord(location) ? location : null;
    } catch {
      return null;
    }
  }

  async function fetchPricebookDetail(pricebookId: string): Promise<Record<string, unknown> | null> {
    try {
      const payload = await request({ path: `/pricebooks/${pricebookId}` });
      const book = payload.pricebook;
      return isRecord(book) ? book : null;
    } catch {
      return null;
    }
  }

  async function fetchEstimateById(estimateId: string): Promise<Record<string, unknown> | null> {
    try {
      const payload = await request({ path: `/estimates/${estimateId}` });
      const estimate = payload.estimate;
      return isRecord(estimate) ? estimate : null;
    } catch (error) {
      if (error instanceof ZohoApiError && error.status !== 404) throw error;
      return null;
    }
  }

  async function fetchSalesOrderById(salesOrderId: string): Promise<Record<string, unknown> | null> {
    try {
      const payload = await request({ path: `/salesorders/${salesOrderId}` });
      const salesOrder = payload.salesorder;
      return isRecord(salesOrder) ? salesOrder : null;
    } catch (error) {
      if (error instanceof ZohoApiError && error.status !== 404) throw error;
      return null;
    }
  }

  async function fetchInvoiceById(invoiceId: string): Promise<Record<string, unknown> | null> {
    try {
      const payload = await request({ path: `/invoices/${invoiceId}` });
      const invoice = payload.invoice;
      return isRecord(invoice) ? invoice : null;
    } catch (error) {
      if (error instanceof ZohoApiError && error.status !== 404) throw error;
      return null;
    }
  }

  async function fetchUsers(): Promise<Record<string, unknown>[]> {
    const allUsers: Record<string, unknown>[] = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const payload = await request({
        path: '/users',
        query: {
          page,
          per_page: perPage,
          filter_by: 'Status.All',
        },
      });

      const users = getRecordArray(payload, 'users');
      allUsers.push(...users);

      const pageContext = getPageContext(payload);
      const hasMore = typeof pageContext?.has_more_page === 'boolean'
        ? pageContext.has_more_page
        : users.length >= perPage;
      if (!hasMore) break;

      page = (typeof pageContext?.page === 'number' ? pageContext.page : page) + 1;
    }

    return allUsers;
  }

  async function requestPricelistsPage(
    query: Record<string, string | number | boolean | undefined | null>,
  ): Promise<Record<string, unknown>> {
    try {
      return await request({
        path: '/pricebooks',
        query,
      });
    } catch (error) {
      if (!(error instanceof ZohoApiError) || error.status < 400) {
        throw error;
      }
      return await request({
        path: '/pricelists',
        query,
      });
    }
  }

  function getPriceListRecords(payload: Record<string, unknown>): Record<string, unknown>[] {
    for (const key of PRICE_LIST_RESPONSE_KEYS) {
      const rows = getRecordArray(payload, key);
      if (rows.length > 0) return rows;
    }
    return [];
  }

  async function fetchPricelists(): Promise<Record<string, unknown>[]> {
    const allPricelists: Record<string, unknown>[] = [];
    let page = 1;
    const perPage = DEFAULT_PER_PAGE;

    while (true) {
      const payload = await requestPricelistsPage({ page, per_page: perPage });
      const rows = getPriceListRecords(payload);
      allPricelists.push(...rows);

      const pageContext = getPageContext(payload);
      const hasMore = typeof pageContext?.has_more_page === 'boolean'
        ? pageContext.has_more_page
        : rows.length >= perPage;
      if (!hasMore) break;

      page = (typeof pageContext?.page === 'number' ? pageContext.page : page) + 1;
    }

    return allPricelists;
  }

  return {
    provider: 'zoho' as const,
    integrationTypeId,
    credentials,
    testConnection,
    fetchPhasePage,
    fetchContactPersons,
    fetchContactById,
    fetchItemById,
    fetchLocationById,
    fetchPricebookDetail,
    fetchEstimateById,
    fetchSalesOrderById,
    fetchInvoiceById,
    fetchPricelists,
    fetchUsers,
    request,
  };
}

export async function refreshZohoAccessToken(
  integrationTypeId: ZohoIntegrationTypeId,
  rawCredentials: Record<string, unknown>,
): Promise<{ accessToken: string; credentials: NormalizedZohoCredentials }> {
  const credentials = normalizeZohoCredentials(integrationTypeId, rawCredentials);
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

  return { accessToken, credentials };
}

export type ZohoAdapter = ReturnType<typeof createZohoAdapter>;
export type { ZohoCredentialsInput };
