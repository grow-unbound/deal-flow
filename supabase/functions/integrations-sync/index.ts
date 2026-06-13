import { handleIntegrationsSync } from '../_shared/integrations-runtime.ts';

Deno.serve((request) => handleIntegrationsSync(request));

