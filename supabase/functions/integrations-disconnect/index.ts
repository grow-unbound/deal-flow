import { handleIntegrationsDisconnect } from '../_shared/integrations-runtime.ts';

Deno.serve((request) => handleIntegrationsDisconnect(request));
