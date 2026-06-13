import { handleIntegrationsConnect } from '../_shared/integrations-runtime.ts';

Deno.serve((request) => handleIntegrationsConnect(request));

