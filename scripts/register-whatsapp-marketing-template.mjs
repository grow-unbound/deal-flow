#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function loadRootEnvLocal() {
  const dotenvPath = path.join(repoRoot, '.env.local');
  try {
    const raw = readFileSync(dotenvPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Warning: could not read ${dotenvPath}: ${error.message}`);
    }
  }
}

loadRootEnvLocal();

const GRAPH_API_VERSION = 'v20.0';
const TOKEN = process.env.WHATSAPP_TOKEN ?? '';
const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
const HEADER_IMAGE_URL = process.env.WHATSAPP_TEMPLATE_HEADER_SAMPLE_URL
  ?? process.env.WHATSAPP_DEFAULT_HEADER_IMAGE_URL
  ?? 'https://assets.yukti.so/platform/whatsapp-campaign-default.jpg';

const TEMPLATE_NAME = 'campaign_published_buyer';

function usage(exitCode = 1) {
  console.log(`Usage: node scripts/register-whatsapp-marketing-template.mjs [--dry-run]

Registers the ${TEMPLATE_NAME} marketing template with Meta Cloud API.
Requires WHATSAPP_TOKEN and WHATSAPP_BUSINESS_ACCOUNT_ID in .env.local.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') usage(0);
    if (arg === '--dry-run') dryRun = true;
  }
  return { dryRun };
}

async function uploadSampleHeaderHandle() {
  const imageRes = await fetch(HEADER_IMAGE_URL);
  if (!imageRes.ok) {
    throw new Error(`Failed to fetch sample header image (${imageRes.status})`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const contentType = imageRes.headers.get('content-type')?.split(';')[0]?.trim() ?? 'image/jpeg';

  const sessionRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.META_APP_ID}/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_length: buffer.byteLength,
      file_type: contentType,
    }),
  });

  const sessionText = await sessionRes.text();
  if (!sessionRes.ok) {
    throw new Error(`Failed to create Meta upload session (${sessionRes.status}): ${sessionText}`);
  }

  const session = JSON.parse(sessionText);
  const uploadId = session.id;
  if (!uploadId) throw new Error('Meta upload session returned no id');

  const uploadRes = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${uploadId}`, {
    method: 'POST',
    headers: {
      Authorization: `OAuth ${TOKEN}`,
      file_offset: '0',
      'Content-Type': contentType,
    },
    body: buffer,
  });

  const uploadText = await uploadRes.text();
  if (!uploadRes.ok) {
    throw new Error(`Failed to upload sample header (${uploadRes.status}): ${uploadText}`);
  }

  const uploaded = JSON.parse(uploadText);
  if (!uploaded.h) throw new Error('Meta upload returned no handle');
  return uploaded.h;
}

function buildTemplatePayload(headerHandle) {
  return {
    name: TEMPLATE_NAME,
    language: 'en',
    category: 'MARKETING',
    components: [
      {
        type: 'HEADER',
        format: 'IMAGE',
        example: { header_handle: [headerHandle] },
      },
      {
        type: 'BODY',
        text: 'Hi {{buyer_name}},\n\n{{seller_name}} has a new campaign live — {{campaign_title}}.\n\n{{buyer_note}}\n\nContact: {{seller_phone_number}} for more details.\n\nCheck it out and order in the app.',
        example: {
          body_text: [['Rajesh', 'MobileMart', 'Monsoon Clearance', 'Flat 15% off selected SKUs', '9876543210']],
        },
      },
      {
        type: 'FOOTER',
        text: 'Powered by Yukti',
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'View campaign',
            url: 'https://app.useyukti.in/buy/catalog?share_token={{1}}',
            example: ['abc123sharetoken'],
          },
          {
            type: 'QUICK_REPLY',
            text: 'Opt Out',
          },
        ],
      },
    ],
  };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  if (!TOKEN || !WABA_ID) {
    console.error('Missing WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID');
    usage();
  }

  const headerHandle = await uploadSampleHeaderHandle();
  const payload = buildTemplatePayload(headerHandle);

  if (dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${WABA_ID}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Template registration failed (${res.status}): ${text}`);
  }

  console.log(`Registered ${TEMPLATE_NAME} with Meta. Response:`);
  console.log(text);
  console.log('\nNext: wait for Meta approval, then UPDATE app.whatsapp_templates.approval_status = approved.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
