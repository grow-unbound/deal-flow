import 'server-only';

const EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LOCAL_EMBEDDING_URL = process.env.LOCAL_EMBEDDING_URL;

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

async function fetchOpenAIEmbedding(text: string): Promise<number[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai');
  }

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI embeddings error: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data[0]?.embedding ?? [];
}

async function fetchLocalEmbedding(text: string): Promise<number[]> {
  if (!LOCAL_EMBEDDING_URL) {
    throw new Error('LOCAL_EMBEDDING_URL is required when EMBEDDING_PROVIDER=local');
  }

  const res = await fetch(LOCAL_EMBEDDING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!res.ok) {
    throw new Error(`Local embedding error: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as { embedding: number[] };
  return json.embedding ?? [];
}

export async function createProductQueryEmbedding(query: string): Promise<string | null> {
  const normalized = query.trim();
  if (!normalized || !EMBEDDING_PROVIDER) {
    return null;
  }

  const embedding =
    EMBEDDING_PROVIDER === 'openai'
      ? await fetchOpenAIEmbedding(normalized)
      : EMBEDDING_PROVIDER === 'local'
        ? await fetchLocalEmbedding(normalized)
        : null;

  if (!embedding || embedding.length === 0) {
    return null;
  }

  return toVectorLiteral(embedding);
}
