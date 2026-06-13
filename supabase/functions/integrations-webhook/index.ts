import { handleIntegrationsWebhook } from '../_shared/integrations-runtime.ts';

Deno.serve((request) => handleIntegrationsWebhook(request));
