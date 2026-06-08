// EP-16-002: minimal PDF stub for invoice id (pilot). Replace with real layout later.

const MINIMAL_PDF = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj
xref
0 4
0000000000 65535 f 
trailer<</Size 4/Root 1 0 R>>
startxref
120
%%EOF`;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  try {
    await req.json().catch(() => ({}));
    const bytes = new TextEncoder().encode(MINIMAL_PDF);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="invoice.pdf"',
      },
    });
  } catch {
    return new Response('Bad request', { status: 400 });
  }
});
