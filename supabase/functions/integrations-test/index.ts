import { handleIntegrationsTest } from '../_shared/integrations-runtime.ts';

Deno.serve((request) => handleIntegrationsTest(request));

