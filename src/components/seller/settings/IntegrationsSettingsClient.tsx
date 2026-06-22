'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Link2,
  Plus,
  RefreshCw,
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
import { useFlagState } from '@/hooks/useFeatureFlag';
import {
  type IntegrationCatalogItem,
  type IntegrationFamilyFlag,
  type IntegrationTestResult,
  useIntegrationsSettings,
} from '@/hooks/useIntegrationsSettings';
import { useRole } from '@/hooks/useRole';
import { cn } from '@/lib/utils';

import { ConnectedIntegrationCard } from './ConnectedIntegrationCard';
import { IntegrationPickerDialog } from './IntegrationPickerDialog';
import { IntegrationsSettingsContentSkeleton } from './IntegrationsSettingsSkeleton';

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
  const month = now.getMonth();
  if (month >= 3 && month <= 5) {
    return `${now.getFullYear()}-01-01`;
  }
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
  } = useIntegrationsSettings();

  const [isOAuthRedirecting, setIsOAuthRedirecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const zohoEnabled = useFlagState('ZOHO_INTEGRATION');
  const tallyEnabled = useFlagState('TALLY_INTEGRATION');
  const busyEnabled = useFlagState('BUSY_INTEGRATION');

  const familyAvailability: Record<IntegrationFamilyFlag, boolean> = {
    ZOHO_INTEGRATION: zohoEnabled !== false,
    TALLY_INTEGRATION: tallyEnabled !== false,
    BUSY_INTEGRATION: busyEnabled !== false,
  };

  const integrations = data?.integrations ?? [];
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
    setWizard({ ...buildWizardState(target), open: true, integrationId: target.id, step: 2 });
  }, [pendingOAuthConnectedId, integrations]);

  // Handle Zoho OAuth return params
  useEffect(() => {
    const connectedTypeId = searchParams.get('connected');
    const oauthError = searchParams.get('oauth_error');

    if (oauthError) {
      console.error('[Zoho OAuth] Error returned from consent screen:', oauthError);
      router.replace('/settings/integrations');
      return;
    }

    if (connectedTypeId) {
      localStorage.setItem('df_zoho_oauth_complete', connectedTypeId);
      window.close();
      router.replace('/settings/integrations');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const wizardIntegration = useMemo(
    () => integrations.find((integration) => integration.id === wizard.integrationId) ?? null,
    [integrations, wizard.integrationId],
  );

  // Auto-run test connection when wizard opens on step 2 with no result yet
  useEffect(() => {
    if (!wizard.open || wizard.step !== 2 || wizard.testResult !== null || !wizardIntegration) return;
    void runTestConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizard.open, wizard.step, wizard.testResult, wizardIntegration?.id]);

  function openWizard(integration: IntegrationCatalogItem) {
    const isConnected = integration.tenant_integration?.status === 'connected';
    setWizard({ ...buildWizardState(integration), open: true, integrationId: integration.id, step: isConnected ? 3 : 0 });
  }

  function updateCredential(key: string, value: string) {
    setWizard((current) => ({
      ...current,
      credentials: { ...current.credentials, [key]: value },
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

    if (!tenantIntegrationId || wizardIntegration.tenant_integration?.status !== 'connected') {
      const connectedView = await connectIntegration({
        integration_type_id: wizardIntegration.id,
        credentials: wizard.credentials,
        config: { connectivity_mode: wizardIntegration.connectivity_mode },
      });

      const connectedIntegration =
        connectedView.integrations.find((i) => i.id === wizardIntegration.id)?.tenant_integration ?? null;

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

    setWizard((current) => ({ ...current, open: false }));
  }

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
      const json = (await response.json()) as {
        data?: { redirect_url?: string };
        error?: { message?: string };
      };
      if (!response.ok || !json.data?.redirect_url) {
        throw new Error(json.error?.message ?? 'Failed to start OAuth flow');
      }
      window.open(json.data.redirect_url, '_blank');

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
        setPendingOAuthConnectedId(connectedId);
        void refetch();
      };
      oauthStorageListenerRef.current = handleStorage;
      window.addEventListener('storage', handleStorage);
    } catch {
      setIsOAuthRedirecting(false);
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────────

  if (isLoading) return <IntegrationsSettingsContentSkeleton />;

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
        description="Once the integration catalog is seeded for this workspace, setup and sync details will show up here."
      />
    );
  }

  const connectedIntegrations = integrations.filter((i) => i.tenant_integration !== null);
  const unconnectedAvailable = integrations.filter(
    (i) => !i.tenant_integration && familyAvailability[i.family_flag],
  );

  const availableCount = integrations.filter((i) => familyAvailability[i.family_flag]).length;
  const connectedCount = connectedIntegrations.length;
  const syncingCount = integrations.filter((i) => {
    const s = i.tenant_integration?.active_job?.status;
    return s === 'queued' || s === 'running';
  }).length;

  const wizardFields = wizardIntegration?.auth_schema?.fields ?? [];
  const missingRequired = wizardFields.filter((f) => f.required && !wizard.credentials[f.key]?.trim());
  const canAdvanceFromConnect = missingRequired.length === 0;
  const hasSuccessfulTest =
    wizard.testResult?.ok === true || wizardIntegration?.tenant_integration?.status === 'connected';

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        {/* ── Top bar: stats + actions ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Available', value: availableCount },
              { label: 'Connected', value: connectedCount },
              { label: 'Syncing now', value: syncingCount },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-2xl border border-cream-200 bg-cream-50 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">{label}</div>
                <div className="mt-1 font-display text-2xl text-cream-900">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refetch()}
              title="Refresh integrations"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>

            {isSellerAdmin && unconnectedAvailable.length > 0 ? (
              <Button type="button" variant="primary" size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4" />
                Add integration
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── Connected integration cards ───────────────────────────────── */}
        {connectedIntegrations.length > 0 ? (
          <div className="space-y-6">
            {connectedIntegrations.map((integration) => (
              <ConnectedIntegrationCard
                key={integration.id}
                integration={integration}
                available={familyAvailability[integration.family_flag]}
                isSellerAdmin={isSellerAdmin}
                onOpenWizard={() => openWizard(integration)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Link2 className="h-7 w-7" strokeWidth={1.5} />}
            heading="No integrations connected yet"
            description={
              isSellerAdmin
                ? "Click 'Add integration' above to connect your first tool."
                : 'A seller admin can set up integrations from this page.'
            }
          />
        )}
      </div>

      {/* ── Integration picker dialog ─────────────────────────────────────── */}
      <IntegrationPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        integrations={unconnectedAvailable}
        onSelect={(integration) => {
          setPickerOpen(false);
          openWizard(integration);
        }}
      />

      {/* ── Setup wizard dialog (unchanged) ──────────────────────────────── */}
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
                    {index < wizard.step ? <CheckCircle2 className="h-3.5 w-3.5 text-success-600" /> : null}
                    <div
                      className={cn(
                        'text-xs font-semibold uppercase tracking-[0.12em]',
                        index < wizard.step ? 'text-success-700' : 'text-cream-600',
                      )}
                    >
                      Step {index + 1}
                    </div>
                  </div>
                  <div
                    className={cn(
                      'mt-1 text-sm font-medium',
                      index < wizard.step ? 'text-success-900' : 'text-cream-900',
                    )}
                  >
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
                        {isOAuthRedirecting ? 'Redirecting to Zoho…' : 'Connect to Zoho'}
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
                      <div
                        className={cn(
                          'rounded-2xl border px-4 py-4',
                          wizard.testResult.ok
                            ? 'border-success-200 bg-success-50'
                            : 'border-warning-500/30 bg-warning-50',
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={wizard.testResult.ok ? 'success' : 'warning'}>
                            {wizard.testResult.ok ? 'Connection verified' : 'Needs review'}
                          </Badge>
                          {wizard.testResult.connection_label ? (
                            <span className="text-sm font-semibold text-cream-900">
                              {wizard.testResult.connection_label}
                            </span>
                          ) : null}
                        </div>
                        {wizard.testResult.message ? (
                          <p className="mt-2 text-sm leading-6 text-cream-700">{wizard.testResult.message}</p>
                        ) : null}
                        {wizard.testResult.sample_counts ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            {Object.entries(wizard.testResult.sample_counts).map(([key, count]) => (
                              <div key={key} className="rounded-xl border border-white/80 bg-white/70 px-3 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-cream-600">
                                  {labelize(key)}
                                </div>
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
                        <Badge variant="outline">
                          Transactional backfill from {formatDate(wizard.importStartDate)}
                        </Badge>
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
                    disabled={
                      !isSellerAdmin ||
                      !wizardIntegration ||
                      !familyAvailability[wizardIntegration.family_flag] ||
                      missingRequired.length > 0 ||
                      isTestingConnection
                    }
                  >
                    {isTestingConnection ? 'Testing…' : 'Test connection'}
                  </Button>
                ) : wizard.step === 1 && wizardIntegration?.auth_schema?.oauth === true ? null : (
                  <Button
                    type="button"
                    onClick={() =>
                      setWizard((current) => ({
                        ...current,
                        step: Math.min(WIZARD_STEPS.length - 1, current.step + 1),
                      }))
                    }
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
                  {isConnecting || isStartingSync ? 'Starting import…' : 'Start import'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
