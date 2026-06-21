'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  BookCheck,
  Boxes,
  Building2,
  Cable,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  ExternalLink,
  Link2,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, ErrorState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFlagState } from '@/hooks/useFeatureFlag';
import {
  type IntegrationCatalogItem,
  type IntegrationFamilyFlag,
  type IntegrationSyncJob,
  type IntegrationTestResult,
  useIntegrationsSettings,
} from '@/hooks/useIntegrationsSettings';
import { useRole } from '@/hooks/useRole';
import { cn } from '@/lib/utils';

import { IntegrationsSettingsContentSkeleton } from './IntegrationsSettingsSkeleton';
import { SettingsSectionCard } from './SettingsSectionCard';

type DetailTab = 'overview' | 'flows' | 'history';
type WizardState = {
  open: boolean;
  integrationId: string | null;
  step: number;
  credentials: Record<string, string>;
  importStartDate: string;
  testResult: IntegrationTestResult | null;
};

const WIZARD_STEPS = ['What you get', 'Connect', 'Test connection', 'Start import'] as const;

function defaultImportStartDate(): string {
  const now = new Date();
  const month = now.getMonth(); // 0=Jan … 3=Apr … 5=Jun … 11=Dec
  if (month >= 3 && month <= 5) {
    // Q1 of Indian FY (Apr–Jun): go back to Jan 1 of this calendar year
    return `${now.getFullYear()}-01-01`;
  }
  // Outside Q1: use Apr 1 of the current Indian FY
  // FY started Apr 1 of this year if month >= 3, otherwise Apr 1 of last year
  const fyStartYear = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${fyStartYear}-04-01`;
}

function labelize(value: string) {
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return withTime ? 'Not yet' : 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return withTime ? 'Not yet' : 'Not set';

  return new Intl.DateTimeFormat('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

function getStatusVariant(status: string) {
  switch (status) {
    case 'connected':
    case 'completed':
    case 'ok':
      return 'success' as const;
    case 'queued':
    case 'running':
    case 'syncing':
      return 'info' as const;
    case 'failed':
    case 'sync_failed':
    case 'expired':
    case 'invalid':
      return 'warning' as const;
    default:
      return 'outline' as const;
  }
}

function getIntegrationIcon(integration: IntegrationCatalogItem) {
  if (integration.connectivity_mode === 'local') return Cable;
  if (integration.id.includes('inventory')) return Boxes;
  if (integration.id.includes('books')) return BookCheck;
  return ServerCog;
}

function getLatestCompleted(integration: IntegrationCatalogItem) {
  return integration.tenant_integration?.sync_history.find((job) => job.status === 'completed') ?? null;
}

function getProgressPercent(job?: IntegrationSyncJob | null) {
  if (!job?.progress) return 0;
  const total = job.progress.items_total ?? 0;
  const processed = job.progress.items_processed ?? 0;
  if (total > 0) return Math.max(4, Math.min(100, Math.round((processed / total) * 100)));
  const phasesTotal = job.progress.phases_total ?? 0;
  const phaseCurrent = job.progress.phase_current ?? 0;
  if (phasesTotal > 0) return Math.max(4, Math.min(100, Math.round((phaseCurrent / phasesTotal) * 100)));
  return job.status === 'queued' ? 8 : 18;
}

function getImportScopes(integration: IntegrationCatalogItem) {
  return [
    ...(integration.capabilities?.inbound_reference ?? []),
    ...(integration.capabilities?.inbound_transactional ?? []),
  ];
}

function buildWizardState(integration: IntegrationCatalogItem | null): WizardState {
  const config = integration?.tenant_integration?.config ?? {};
  const fields = integration?.auth_schema?.fields ?? [];
  const credentials = fields.reduce<Record<string, string>>((acc, field) => {
    const raw = config[field.key];
    acc[field.key] = typeof raw === 'string' ? raw : '';
    return acc;
  }, {});

  return {
    open: false,
    integrationId: integration?.id ?? null,
    step: 0,
    credentials,
    importStartDate: defaultImportStartDate(),
    testResult: null,
  };
}

function IntegrationCard({
  integration,
  available,
  selected,
  onSelect,
  onOpenWizard,
}: {
  integration: IntegrationCatalogItem;
  available: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpenWizard: () => void;
}) {
  const Icon = getIntegrationIcon(integration);
  const activeJob = integration.tenant_integration?.active_job;
  const latestCompleted = getLatestCompleted(integration);
  const statusLabel = !available
    ? 'Coming soon'
    : activeJob?.status === 'running'
      ? 'Import running'
      : activeJob?.status === 'queued'
        ? 'Queued'
        : integration.tenant_integration?.status === 'connected'
          ? 'Connected'
          : integration.connectivity_mode === 'local'
            ? 'Needs bridge'
            : 'Not set up';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'w-full rounded-2xl border bg-white p-5 text-left shadow-xs transition-all',
        selected ? 'border-teal-200 ring-2 ring-teal-100' : 'border-cream-200 hover:border-teal-200',
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cream-200 bg-cream-50 text-teal-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl text-cream-900">{integration.display_name}</h2>
              {selected ? <Badge variant="teal">Selected</Badge> : null}
            </div>
            <p className="max-w-md text-sm leading-6 text-cream-700">{integration.description}</p>
          </div>
        </div>
        <Badge variant={available ? getStatusVariant(activeJob?.status ?? integration.tenant_integration?.status ?? 'pending_setup') : 'outline'}>
          {statusLabel}
        </Badge>
      </div>

      <div className="mt-5 space-y-3 border-t border-cream-200 pt-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-cream-700">
          <span className="inline-flex items-center gap-2">
            <Building2 className="h-4 w-4 text-cream-500" />
            {integration.connectivity_mode === 'local' ? 'Bridge required' : 'Cloud connection'}
          </span>
          {latestCompleted ? (
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-cream-500" />
              Last sync {formatDate(latestCompleted.completed_at, true)}
            </span>
          ) : null}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Workspace state</div>
            <div className="mt-2 text-sm font-medium text-cream-900">
              {!available
                ? 'This family flag is still gated.'
                : activeJob?.progress?.phase_label ?? 'Ready to verify credentials and import.'}
            </div>
          </div>
          <div className="rounded-xl border border-cream-200 bg-cream-50 px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Imported scopes</div>
            <div className="mt-2 text-sm font-medium text-cream-900">{getImportScopes(integration).length} flows ready</div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-cream-600">
            {integration.tenant_integration ? 'Open detail to inspect runtime health.' : 'Run setup before the first import.'}
          </span>
          <Button
            type="button"
            variant={available ? 'primary' : 'outline'}
            disabled={!available}
            onClick={(event) => {
              event.stopPropagation();
              onOpenWizard();
            }}
          >
            {integration.tenant_integration ? `Manage ${integration.display_name}` : `Connect ${integration.display_name}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function IntegrationsSettingsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isSellerAdmin } = useRole();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    testConnection,
    connectIntegration,
    startSync,
    isTestingConnection,
    isConnecting,
    isStartingSync,
  } =
    useIntegrationsSettings();
  const [isOAuthRedirecting, setIsOAuthRedirecting] = useState(false);

  const zohoEnabled = useFlagState('ZOHO_INTEGRATION');
  const tallyEnabled = useFlagState('TALLY_INTEGRATION');
  const busyEnabled = useFlagState('BUSY_INTEGRATION');

  const familyAvailability: Record<IntegrationFamilyFlag, boolean> = {
    ZOHO_INTEGRATION: zohoEnabled !== false,
    TALLY_INTEGRATION: tallyEnabled !== false,
    BUSY_INTEGRATION: busyEnabled !== false,
  };

  const integrations = data?.integrations ?? [];
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [wizard, setWizard] = useState<WizardState>(buildWizardState(null));
  const [pendingOAuthConnectedId, setPendingOAuthConnectedId] = useState<string | null>(null);
  const oauthStorageListenerRef = useRef<((e: StorageEvent) => void) | null>(null);
  useEffect(() => {
    return () => {
      if (oauthStorageListenerRef.current) {
        window.removeEventListener('storage', oauthStorageListenerRef.current);
      }
    };
  }, []);

  // Advance wizard when fresh integration data arrives after OAuth cross-tab signal
  useEffect(() => {
    if (!pendingOAuthConnectedId || integrations.length === 0) return;
    const target = integrations.find((i) => i.id === pendingOAuthConnectedId);
    if (!target) return;
    setPendingOAuthConnectedId(null);
    setSelectedIntegrationId(target.id);
    setWizard({ ...buildWizardState(target), open: true, integrationId: target.id, step: 2 });
  }, [pendingOAuthConnectedId, integrations]);

  // Auto-open start-import step when returning from Zoho OAuth consent screen
  useEffect(() => {
    const connectedTypeId = searchParams.get('connected');
    const oauthError = searchParams.get('oauth_error');

    if (oauthError) {
      console.error('[Zoho OAuth] Error returned from consent screen:', oauthError);
      // Clear the param so refresh doesn't re-show the error
      router.replace('/settings/integrations');
      return;
    }

    if (connectedTypeId) {
      // Signal immediately — don't gate on integrations data loading
      localStorage.setItem('df_zoho_oauth_complete', connectedTypeId);
      // Try to close this OAuth tab; may fail if COOP headers severed window.opener
      window.close();
      // Clear the param — if tab didn't close, page stays clean on next render
      router.replace('/settings/integrations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function startZohoOAuth() {
    if (!wizardIntegration) return;
    const orgId = wizard.credentials['org_id'] ?? '';
    if (!orgId.trim()) return;

    setIsOAuthRedirecting(true);
    try {
      const response = await fetch('/api/settings/integrations/zoho/oauth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_type_id: wizardIntegration.id, org_id: orgId }),
      });
      const json = await response.json() as { data?: { redirect_url?: string }; error?: { message?: string } };
      if (!response.ok || !json.data?.redirect_url) {
        throw new Error(json.error?.message ?? 'Failed to start OAuth flow');
      }
      window.open(json.data.redirect_url, '_blank');
      // Listen for the OAuth tab to signal completion via localStorage
      if (oauthStorageListenerRef.current) {
        window.removeEventListener('storage', oauthStorageListenerRef.current);
      }
      const handleStorage = (e: StorageEvent) => {
        if (e.key !== 'df_zoho_oauth_complete' || !e.newValue) return;
        window.removeEventListener('storage', handleStorage);
        oauthStorageListenerRef.current = null;
        const connectedId = e.newValue;
        localStorage.removeItem('df_zoho_oauth_complete');
        setIsOAuthRedirecting(false);
        // Store the connected id and refetch — the pendingOAuthConnectedId effect
        // will advance the wizard once fresh data arrives (avoids stale closure)
        setPendingOAuthConnectedId(connectedId);
        void refetch();
      };
      oauthStorageListenerRef.current = handleStorage;
      window.addEventListener('storage', handleStorage);
    } catch {
      setIsOAuthRedirecting(false);
    }
  }

  useEffect(() => {
    if (integrations.length === 0) {
      setSelectedIntegrationId(null);
      return;
    }

    if (!selectedIntegrationId || !integrations.some((integration) => integration.id === selectedIntegrationId)) {
      const preferred = integrations.find((integration) => familyAvailability[integration.family_flag]) ?? integrations[0];
      setSelectedIntegrationId(preferred.id);
    }
  }, [familyAvailability, integrations, selectedIntegrationId]);

  const selectedIntegration = useMemo(
    () => integrations.find((integration) => integration.id === selectedIntegrationId) ?? null,
    [integrations, selectedIntegrationId],
  );

  const wizardIntegration = useMemo(
    () => integrations.find((integration) => integration.id === wizard.integrationId) ?? selectedIntegration ?? null,
    [integrations, selectedIntegration, wizard.integrationId],
  );

  // Auto-run test connection when wizard opens on step 2 with no result yet
  useEffect(() => {
    if (!wizard.open || wizard.step !== 2 || wizard.testResult !== null || !wizardIntegration) return;
    void runTestConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.open, wizard.step, wizard.testResult, wizardIntegration?.id]);

  function openWizard(integration: IntegrationCatalogItem) {
    setSelectedIntegrationId(integration.id);
    const isConnected = integration.tenant_integration?.status === 'connected';
    setWizard({ ...buildWizardState(integration), open: true, integrationId: integration.id, step: isConnected ? 3 : 0 });
  }

  function updateCredential(key: string, value: string) {
    setWizard((current) => ({
      ...current,
      credentials: {
        ...current.credentials,
        [key]: value,
      },
      testResult: null,
    }));
  }

  async function runTestConnection() {
    if (!wizardIntegration) return;
    const result = await testConnection({
      integration_type_id: wizardIntegration.id,
      credentials: wizard.credentials,
    });
    setWizard((current) => ({ ...current, testResult: result }));
  }

  async function runStartImport() {
    if (!wizardIntegration) return;

    let tenantIntegrationId = wizardIntegration.tenant_integration?.id ?? null;

    // OAuth-connected integrations are already stored in the DB via the callback route.
    // Only call connectIntegration for manual credential flows or when not yet connected.
    if (!tenantIntegrationId || wizardIntegration.tenant_integration?.status !== 'connected') {
      const connectedView = await connectIntegration({
        integration_type_id: wizardIntegration.id,
        credentials: wizard.credentials,
        config: { connectivity_mode: wizardIntegration.connectivity_mode },
      });

      const connectedIntegration =
        connectedView.integrations.find((integration) => integration.id === wizardIntegration.id)?.tenant_integration ?? null;

      if (!connectedIntegration?.id) {
        throw new Error('Integration connected, but no tenant integration record was returned.');
      }
      tenantIntegrationId = connectedIntegration.id;
    }

    await startSync({
      integration_type_id: wizardIntegration.id,
      tenant_integration_id: tenantIntegrationId,
      credentials: wizard.credentials,
      import_start_date: wizard.importStartDate,
    });

    setSelectedIntegrationId(wizardIntegration.id);
    setDetailTab('overview');
    setWizard((current) => ({ ...current, open: false }));
  }

  if (isLoading) {
    return <IntegrationsSettingsContentSkeleton />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        heading="Could not load integrations"
        description={error instanceof Error ? error.message : 'Something went wrong.'}
        onRetry={() => void refetch()}
      />
    );
  }

  if (integrations.length === 0) {
    return (
      <EmptyState
        icon={<Link2 className="h-7 w-7" strokeWidth={1.5} />}
        heading="No integrations configured yet"
        description="Once the integration catalog is seeded for this workspace, setup and sync runtime details will show up here."
      />
    );
  }

  const selectedAvailable = selectedIntegration ? familyAvailability[selectedIntegration.family_flag] : false;
  const activeJob = selectedIntegration?.tenant_integration?.active_job ?? null;
  const latestCompleted = selectedIntegration ? getLatestCompleted(selectedIntegration) : null;
  const summaryEntries = Object.entries(latestCompleted?.summary ?? {});
  const connectedCount = integrations.filter((integration) => integration.tenant_integration?.status === 'connected').length;
  const syncingCount = integrations.filter((integration) => {
    const status = integration.tenant_integration?.active_job?.status;
    return status === 'queued' || status === 'running';
  }).length;
  const availableCount = integrations.filter((integration) => familyAvailability[integration.family_flag]).length;

  const wizardFields = wizardIntegration?.auth_schema?.fields ?? [];
  const missingRequired = wizardFields.filter((field) => field.required && !wizard.credentials[field.key]?.trim());
  const canAdvanceFromConnect = missingRequired.length === 0;
  const hasSuccessfulTest = wizard.testResult?.ok === true || wizardIntegration?.tenant_integration?.status === 'connected';

  return (
    <>
      <div className="space-y-6">
        <div className="rounded-2xl border border-cream-200 bg-cream-50 px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)] lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="teal">Single-page setup</Badge>
                <Badge variant="outline">Live sync polling</Badge>
              </div>
              <p className="text-sm leading-6 text-cream-700">
                Family flags still gate availability, but this screen now keeps catalog discovery, setup, and runtime health together. Test credentials, start the first import, and watch progress without leaving Settings.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cream-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Available</div>
                <div className="mt-2 text-2xl font-display text-cream-900">{availableCount}</div>
              </div>
              <div className="rounded-2xl border border-cream-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Connected</div>
                <div className="mt-2 text-2xl font-display text-cream-900">{connectedCount}</div>
              </div>
              <div className="rounded-2xl border border-cream-200 bg-white px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Syncing now</div>
                <div className="mt-2 text-2xl font-display text-cream-900">{syncingCount}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] xl:items-start">
          <SettingsSectionCard
            title="Integration catalog"
            subtitle="Cards stay visible across rollouts so teams can see what is ready now and what is still gated."
            icon={Link2}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Catalog state</div>
                <div className="mt-2 text-sm font-medium text-cream-900">{integrations.length} integrations in scope</div>
              </div>
              <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Pilot rule</div>
                <div className="mt-2 text-sm font-medium text-cream-900">Zoho remains the first flagged rollout</div>
              </div>
              <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Permissions</div>
                <div className="mt-2 text-sm font-medium text-cream-900">
                  {isSellerAdmin ? 'Seller admins can connect and import' : 'Seller admin required for setup'}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  available={familyAvailability[integration.family_flag]}
                  selected={integration.id === selectedIntegrationId}
                  onSelect={() => setSelectedIntegrationId(integration.id)}
                  onOpenWizard={() => openWizard(integration)}
                />
              ))}
            </div>
          </SettingsSectionCard>

          {selectedIntegration ? (
            <section className="overflow-hidden rounded-xl border border-cream-300 bg-white shadow-xs">
              <header className="border-b border-cream-200 bg-cream-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-teal-600 shadow-sm ring-1 ring-cream-200">
                    {(() => {
                      const Icon = getIntegrationIcon(selectedIntegration);
                      return <Icon size={18} aria-hidden />;
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base font-semibold text-cream-900">{selectedIntegration.display_name}</h2>
                      <Badge variant={selectedAvailable ? getStatusVariant(activeJob?.status ?? selectedIntegration.tenant_integration?.status ?? 'pending_setup') : 'outline'}>
                        {!selectedAvailable ? 'Coming soon' : labelize(activeJob?.status ?? selectedIntegration.tenant_integration?.status ?? 'not_set_up')}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-cream-600">{selectedIntegration.description}</p>
                  </div>
                </div>
              </header>

              <div className="space-y-5 px-5 py-5">
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                  <div>
                    <div className="text-sm font-semibold text-cream-900">Detail state</div>
                    <p className="mt-2 max-w-xl text-sm leading-6 text-cream-700">
                      {selectedAvailable
                        ? activeJob?.progress?.phase_label ?? 'Reconnect or inspect the latest runtime state from here.'
                        : 'This integration family is still gated. The detail view stays visible so rollout pilots can be explained before the flag is enabled.'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={selectedIntegration.tenant_integration ? 'secondary' : 'primary'}
                    disabled={!selectedAvailable || !isSellerAdmin}
                    onClick={() => openWizard(selectedIntegration)}
                  >
                    {selectedIntegration.tenant_integration ? `Reconnect ${selectedIntegration.display_name}` : `Open setup for ${selectedIntegration.display_name}`}
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Health</div>
                    <div className="mt-3 flex items-center gap-2 text-lg font-semibold text-cream-900">
                      {selectedIntegration.tenant_integration?.health_status === 'ok' ? (
                        <ShieldCheck className="h-5 w-5 text-success-700" />
                      ) : (
                        <ShieldAlert className="h-5 w-5 text-warning-700" />
                      )}
                      {labelize(selectedIntegration.tenant_integration?.health_status ?? 'pending_setup')}
                    </div>
                    <div className="mt-2 text-sm text-cream-700">
                      Checked {formatDate(selectedIntegration.tenant_integration?.last_health_check_at, true)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Connected</div>
                    <div className="mt-3 text-lg font-semibold text-cream-900">{formatDate(selectedIntegration.tenant_integration?.connected_at)}</div>
                    <div className="mt-2 text-sm text-cream-700">First successful handshake for this tenant.</div>
                  </div>
                  <div className="rounded-2xl border border-cream-200 bg-cream-50 p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">Latest sync</div>
                    <div className="mt-3 text-lg font-semibold text-cream-900">{formatDate(latestCompleted?.completed_at, true)}</div>
                    <div className="mt-2 text-sm text-cream-700">
                      {activeJob ? 'Polling every 3 seconds while active.' : 'History updates after every completed run.'}
                    </div>
                  </div>
                </div>

                {activeJob ? (
                  <div className="rounded-2xl border border-cream-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-cream-900">Initial import</span>
                          <Badge variant={getStatusVariant(activeJob.status)}>{labelize(activeJob.status)}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-cream-700">{activeJob.progress?.phase_label ?? 'Waiting for worker progress.'}</p>
                      </div>
                      <div className="inline-flex items-center gap-2 text-sm text-cream-700">
                        <RefreshCw className={cn('h-4 w-4', activeJob.status === 'running' && 'animate-spin')} />
                        Live polling
                      </div>
                    </div>
                    <div className="mt-4 h-3 overflow-hidden rounded-full bg-cream-200">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${getProgressPercent(activeJob)}%` }} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-cream-700">
                      <span>{getProgressPercent(activeJob)}% complete</span>
                      <span>
                        Phase {activeJob.progress?.phase_current ?? 0} of {activeJob.progress?.phases_total ?? 0}
                        {' · '}
                        {activeJob.progress?.items_processed ?? 0} / {activeJob.progress?.items_total ?? 0} items
                        {' · '}
                        {activeJob.progress?.items_failed ?? 0} errors
                      </span>
                    </div>
                  </div>
                ) : summaryEntries.length > 0 ? (
                  <div className="rounded-2xl border border-cream-200 bg-white p-4">
                    <div className="text-sm font-semibold text-cream-900">Latest import summary</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {summaryEntries.map(([key, count]) => {
                        const Icon =
                          key === 'brands' ? Building2 : key === 'products' ? Boxes : key === 'customers' ? BookCheck : DatabaseZap;
                        return (
                          <div key={key} className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-teal-700 ring-1 ring-cream-200">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{labelize(key)}</div>
                                <div className="text-lg font-semibold text-cream-900">{count}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as DetailTab)}>
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="flows">Data flows</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                        <div className="text-sm font-semibold text-cream-900">Setup notes</div>
                        <div className="mt-3 space-y-2 text-sm leading-6 text-cream-700">
                          <div className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                            <span>
                              {selectedIntegration.connectivity_mode === 'local'
                                ? 'Bridge install, credential test, and initial import stay in the same wizard.'
                                : 'Credential verification and the first import stay in the same wizard.'}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                            <span>Sync history updates live while a job is queued or running.</span>
                          </div>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                        <div className="text-sm font-semibold text-cream-900">Import coverage</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {getImportScopes(selectedIntegration).map((scope) => (
                            <div key={scope} className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-teal-600" />
                                <span className="text-sm font-medium text-cream-900">{labelize(scope)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="flows">
                    {(selectedIntegration.tenant_integration?.data_flows ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm text-cream-700">
                        Data flows will unlock after the first import completes.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedIntegration.tenant_integration?.data_flows.map((flow) => (
                          <div key={flow.id} className="rounded-2xl border border-cream-200 bg-white px-4 py-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-cream-900">{labelize(flow.entity_type)}</span>
                              <Badge variant={flow.is_active ? 'success' : 'outline'}>{flow.is_active ? 'Active' : 'Paused'}</Badge>
                            </div>
                            <p className="mt-1 text-sm text-cream-700">
                              {labelize(flow.direction)} via {labelize(flow.trigger_type)}
                              {flow.schedule ? ` · ${flow.schedule}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="history">
                    {(selectedIntegration.tenant_integration?.sync_history ?? []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-cream-300 bg-cream-50 px-4 py-6 text-sm text-cream-700">
                        Sync history will appear here after the first import runs.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedIntegration.tenant_integration?.sync_history.map((job) => (
                          <div key={job.id} className="rounded-2xl border border-cream-200 bg-white px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-cream-900">{labelize(job.job_type)}</span>
                                  <Badge variant={getStatusVariant(job.status)}>{labelize(job.status)}</Badge>
                                </div>
                                <p className="mt-1 text-sm text-cream-700">{job.progress?.phase_label ?? 'No phase details reported yet.'}</p>
                              </div>
                              <div className="text-right text-xs text-cream-600">{formatDate(job.completed_at ?? job.started_at ?? job.created_at, true)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <Dialog open={wizard.open} onOpenChange={(open) => setWizard((current) => ({ ...current, open }))}>
        <DialogContent className="max-w-3xl border-cream-200 bg-white">
          <DialogHeader>
            <DialogTitle className="font-display text-cream-900">
              {wizardIntegration ? `${wizardIntegration.display_name} setup` : 'Integration setup'}
            </DialogTitle>
            <DialogDescription className="text-cream-700">
              Keep discovery, connection checks, and the first import in one flow. The detail panel updates automatically once the job is queued.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5">
            <div className="grid gap-2 md:grid-cols-4">
              {WIZARD_STEPS.map((stepLabel, index) => (
                <div
                  key={stepLabel}
                  className={cn(
                    'rounded-2xl border px-3 py-3',
                    wizard.step === index
                      ? 'border-teal-200 bg-teal-50'
                      : index < wizard.step
                        ? 'border-success-200 bg-success-50'
                        : 'border-cream-200 bg-white',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {index < wizard.step ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success-600" />
                    ) : null}
                    <div className={cn(
                      'text-xs font-semibold uppercase tracking-[0.12em]',
                      index < wizard.step ? 'text-success-700' : 'text-cream-600',
                    )}>
                      Step {index + 1}
                    </div>
                  </div>
                  <div className={cn(
                    'mt-1 text-sm font-medium',
                    index < wizard.step ? 'text-success-900' : 'text-cream-900',
                  )}>
                    {stepLabel}
                  </div>
                </div>
              ))}
            </div>

            {wizardIntegration ? (
              <>
                {wizard.step === 0 ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-cream-900">
                        <Sparkles className="h-4 w-4 text-teal-600" />
                        What this import will cover
                      </div>
                      <p className="mt-2 text-sm leading-6 text-cream-700">
                        The first run imports reference data first, then recent transactional records from the chosen date window.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {getImportScopes(wizardIntegration).map((scope) => (
                        <div key={scope} className="rounded-xl border border-cream-200 bg-white px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-teal-600" />
                            <span className="text-sm font-medium text-cream-900">{labelize(scope)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {wizard.step === 1 ? (
                  <div className="space-y-4">
                    {wizardIntegration.connectivity_mode === 'local' ? (
                      <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-cream-900">
                          <ExternalLink className="h-4 w-4 text-teal-600" />
                          Local bridge flow
                        </div>
                        <p className="mt-2 text-sm leading-6 text-cream-700">
                          Keep the DealFlow bridge agent online near the source system, then verify the connection before the first import.
                        </p>
                      </div>
                    ) : null}

                    {wizardIntegration.auth_schema?.oauth === true ? (
                      <div className="rounded-2xl border border-teal-100 bg-teal-50 px-4 py-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-cream-900">
                          <Zap className="h-4 w-4 text-teal-600" />
                          One-click Zoho login
                        </div>
                        <p className="mt-2 text-sm leading-6 text-cream-700">
                          Enter your Organization ID, then click the button below to log in with your Zoho account. You&apos;ll be redirected back here automatically.
                        </p>
                      </div>
                    ) : null}

                    <div className="grid gap-4 sm:grid-cols-2">
                      {wizardFields.map((field) => (
                        <Input
                          key={field.key}
                          label={field.label}
                          type={field.type === 'password' ? 'password' : 'text'}
                          required={field.required}
                          hint={field.help}
                          placeholder={field.placeholder}
                          value={wizard.credentials[field.key] ?? ''}
                          onChange={(event) => updateCredential(field.key, event.target.value)}
                        />
                      ))}
                    </div>

                    {wizardIntegration.auth_schema?.oauth === true ? (
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!isSellerAdmin || missingRequired.length > 0 || isOAuthRedirecting}
                        onClick={() => void startZohoOAuth()}
                        className="w-full"
                      >
                        <Zap className="h-4 w-4" />
                        {isOAuthRedirecting ? 'Redirecting to Zoho...' : 'Connect to Zoho'}
                      </Button>
                    ) : null}

                    {!isSellerAdmin ? (
                      <div className="rounded-2xl border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                        Seller admin access is required to test credentials and start imports.
                      </div>
                    ) : null}

                    {missingRequired.length > 0 ? (
                      <div className="rounded-2xl border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-800">
                        Fill the required fields before moving to connection testing.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {wizard.step === 2 ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-cream-900">
                        <ShieldCheck className="h-4 w-4 text-teal-600" />
                        Verify before import
                      </div>
                      <p className="mt-2 text-sm leading-6 text-cream-700">
                        We call the test-connection API with the values from the previous step. Successful results stay visible here so import can start with confidence.
                      </p>
                    </div>

                    {wizard.testResult ? (
                      <div className={cn('rounded-2xl border px-4 py-4', wizard.testResult.ok ? 'border-success-200 bg-success-50' : 'border-warning-500/30 bg-warning-50')}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={wizard.testResult.ok ? 'success' : 'warning'}>
                            {wizard.testResult.ok ? 'Connection verified' : 'Needs review'}
                          </Badge>
                          {wizard.testResult.connection_label ? (
                            <span className="text-sm font-semibold text-cream-900">{wizard.testResult.connection_label}</span>
                          ) : null}
                        </div>
                        {wizard.testResult.message ? <p className="mt-2 text-sm leading-6 text-cream-700">{wizard.testResult.message}</p> : null}
                        {wizard.testResult.sample_counts ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            {Object.entries(wizard.testResult.sample_counts).map(([key, count]) => (
                              <div key={key} className="rounded-xl border border-white/80 bg-white/70 px-3 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{labelize(key)}</div>
                                <div className="mt-2 text-lg font-semibold text-cream-900">{count}</div>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {wizard.step === 3 ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-4">
                      <div className="text-sm font-semibold text-cream-900">Start import</div>
                      <p className="mt-2 text-sm leading-6 text-cream-700">
                        Choose the backfill window for orders, estimates, and invoices. Reference data will import first either way.
                      </p>
                    </div>

                    <DatePicker
                      label="Import transactional history since"
                      value={wizard.importStartDate}
                      onChange={(value) => setWizard((current) => ({ ...current, importStartDate: value }))}
                      hint="Defaults to the start of the current financial year."
                    />

                    <div className="rounded-2xl border border-cream-200 bg-white px-4 py-4 text-sm text-cream-700">
                      <div className="font-semibold text-cream-900">Run order</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Reference data</Badge>
                        <ArrowRight className="h-4 w-4 text-cream-500" />
                        <Badge variant="outline">Transactional backfill from {formatDate(wizard.importStartDate)}</Badge>
                        <ArrowRight className="h-4 w-4 text-cream-500" />
                        <Badge variant="outline">Detail panel live polling</Badge>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </DialogBody>

          <DialogFooter className="justify-between">
            <div className="text-sm text-cream-600">All progress returns to the detail panel.</div>
            <div className="flex items-center gap-2">
              {wizard.step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setWizard((current) => ({ ...current, step: Math.max(0, current.step - 1) }))}
                  disabled={isTestingConnection || isConnecting || isStartingSync}
                >
                  Back
                </Button>
              ) : null}

              {wizard.step < WIZARD_STEPS.length - 1 ? (
                wizard.step === 2 && !hasSuccessfulTest ? (
                  <Button
                    type="button"
                    onClick={() => void runTestConnection()}
                    disabled={!isSellerAdmin || !wizardIntegration || !familyAvailability[wizardIntegration.family_flag] || missingRequired.length > 0 || isTestingConnection}
                  >
                    {isTestingConnection ? 'Testing...' : 'Test connection'}
                  </Button>
                ) : wizard.step === 1 && wizardIntegration?.auth_schema?.oauth === true ? null : (
                  <Button
                    type="button"
                    onClick={() => setWizard((current) => ({ ...current, step: Math.min(WIZARD_STEPS.length - 1, current.step + 1) }))}
                    disabled={
                      !wizardIntegration ||
                      !familyAvailability[wizardIntegration.family_flag] ||
                      (wizard.step === 1 && !canAdvanceFromConnect) ||
                      (wizard.step === 2 && !hasSuccessfulTest)
                    }
                  >
                    Continue
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  onClick={() => void runStartImport()}
                  disabled={
                    !isSellerAdmin ||
                    !wizardIntegration ||
                    !familyAvailability[wizardIntegration.family_flag] ||
                    !hasSuccessfulTest ||
                    !wizard.importStartDate ||
                    isConnecting ||
                    isStartingSync
                  }
                >
                  {isConnecting || isStartingSync ? 'Starting import...' : 'Start import'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
