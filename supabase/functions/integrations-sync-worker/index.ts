import { handleIntegrationsSyncWorker } from '../_shared/integrations-runtime.ts';

Deno.serve((request) => handleIntegrationsSyncWorker(request));

