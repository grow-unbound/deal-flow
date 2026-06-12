export interface Env {
  ASSETS_BUCKET: unknown;
  UPLOAD_SECRET: string;
}

function json(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/upload') {
      return json(
        {
          success: false,
          error: 'Phase 3 upload handler not implemented yet.',
        },
        { status: 501 },
      );
    }

    return json({
      service: 'yukti-image-worker',
      status: 'ok',
      message: 'Phase 1 infrastructure is deployed. Upload handler arrives in phase 3.',
    });
  },
};
