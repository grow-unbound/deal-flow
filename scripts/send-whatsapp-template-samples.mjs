#!/usr/bin/env node
/**
 * Enqueue one sample WhatsApp message per approved platform template,
 * then trigger the dispatch worker. For pipeline / Meta payload verification.
 *
 * Usage:
 *   node scripts/send-whatsapp-template-samples.mjs [--phone 9490744841] [--dry-run]
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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

const DEFAULT_PHONE = '9490744841';
const PLATFORM_TENANT_ID = process.env.WHATSAPP_PLATFORM_TENANT_ID?.trim();
const DISTRIBUTOR_TENANT_ID = '550e8400-e29b-41d4-a716-446655440501';
const SAMPLE_ENTITY_ID = randomUUID();

const SAMPLE_BY_KEY = {
  buyer_name: 'Phani',
  seller_name: 'TechWave Electronics',
  seller_team: 'TechWave Electronics',
  seller_location: 'Bangalore Main',
  buyer_phone_number: '9490744841',
  seller_phone_number: process.env.WHATSAPP_ADMIN_NUMBER?.replace(/^91/, '') ?? '9490744841',
  order_number: 'ORD-SAMPLE-001',
  estimate_number: 'EST-SAMPLE-001',
  request_number: 'EST-SAMPLE-001',
  total_amount: '12500',
  item_count: '3',
  eta: '24',
  due_invoice_count: '2',
  outstanding_amount: '4500',
  due_status: 'Overdue by 5 days',
  otp: '654321',
  product_name: 'Login to Yukti',
  support_number: process.env.WHATSAPP_ADMIN_NUMBER ?? '919490744841',
  campaign_title: 'Monsoon Clearance',
  buyer_note: 'Flat 15% off selected SKUs — sample broadcast note.',
};

const TRIGGER_BY_TEMPLATE = {
  login_otp: { triggerSource: 'otp_login', tenantId: PLATFORM_TENANT_ID, priority: 1 },
  order_received_buyer: { triggerSource: 'order_placed', tenantId: DISTRIBUTOR_TENANT_ID, priority: 1, relatedEntityType: 'orders' },
  order_received_seller: { triggerSource: 'order_placed', tenantId: DISTRIBUTOR_TENANT_ID, priority: 1, relatedEntityType: 'orders' },
  request_received_buyer: { triggerSource: 'enquiry_received', tenantId: DISTRIBUTOR_TENANT_ID, priority: 1, relatedEntityType: 'estimates' },
  request_received_seller: { triggerSource: 'enquiry_received', tenantId: DISTRIBUTOR_TENANT_ID, priority: 1, relatedEntityType: 'estimates' },
  buyer_payment_reminder: { triggerSource: 'broadcast', tenantId: DISTRIBUTOR_TENANT_ID, priority: 5 },
  campaign_published_buyer: { triggerSource: 'broadcast', tenantId: DISTRIBUTOR_TENANT_ID, priority: 5 },
};

function parseArgs(argv) {
  let phone = DEFAULT_PHONE;
  let dryRun = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    if (arg === '--phone' && argv[i + 1]) {
      phone = argv[i + 1];
      i += 1;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/send-whatsapp-template-samples.mjs [--phone 9490744841] [--dry-run]');
      process.exit(0);
    }
  }
  return { phone, dryRun };
}

function formatWhatsappDestination(phone) {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('91') && digits.length > 10 ? digits.slice(-10) : digits;
  return `91${normalized}`;
}

function buildBodyParams(template) {
  if (template.meta_template_name === 'login_otp') {
    return [
      { text: SAMPLE_BY_KEY.otp },
      { text: SAMPLE_BY_KEY.product_name },
      { text: SAMPLE_BY_KEY.support_number },
    ];
  }

  return (template.variables ?? []).map((variable) => {
    const key = template.meta_template_name === 'order_received_buyer' && variable.key === 'seller_name'
      ? 'seller_team'
      : variable.key;
    return {
      text: SAMPLE_BY_KEY[key] ?? SAMPLE_BY_KEY[variable.key] ?? `sample-${variable.key}`,
      parameter_name: key,
    };
  });
}

function buildButtonParams(template) {
  const configs = Array.isArray(template.buttons_config) ? template.buttons_config : [];
  const params = [];

  for (const button of configs) {
    if (button.type !== 'url') continue;
    const source = button.variable_source;
    let text = SAMPLE_ENTITY_ID;
    if (source === 'tenant_whatsapp_phone') {
      text = formatWhatsappDestination(SAMPLE_BY_KEY.seller_phone_number);
    } else if (source === 'share_token') {
      text = 'sample-share-token';
    } else if (!source && !button.url_template?.includes('{{')) {
      continue;
    }
    params.push({
      type: 'url',
      index: button.index ?? String(params.length),
      text,
    });
  }

  if (template.meta_template_name === 'login_otp') {
    return [{ type: 'url', index: '0', text: SAMPLE_BY_KEY.otp }];
  }

  return params;
}

function buildSendPayload(template) {
  const payload = {
    meta_template_name: template.meta_template_name,
    locale: template.locale ?? 'en',
    body_params: buildBodyParams(template),
  };

  const buttonParams = buildButtonParams(template);
  if (buttonParams.length > 0) {
    payload.button_params = buttonParams;
  }

  if (template.header_config?.format === 'image') {
    payload.header_params = {
      type: 'image',
      link: process.env.WHATSAPP_TEMPLATE_HEADER_SAMPLE_URL
        ?? process.env.WHATSAPP_DEFAULT_HEADER_IMAGE_URL
        ?? 'https://assets.yukti.so/whatsapp-marketing-media/whatsapp-marketing-template.png',
    };
  }

  return payload;
}

async function triggerDispatch(messageIds) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');

  const res = await fetch(`${supabaseUrl}/functions/v1/whatsapp-dispatch-worker`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { Authorization: `Bearer ${anonKey}` } : {}),
    },
    body: JSON.stringify({ message_ids: messageIds }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Dispatch worker returned ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function main() {
  const { phone, dryRun } = parseArgs(process.argv.slice(2));
  const recipientPhone = formatWhatsappDestination(phone);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase URL or service role key in .env.local');
  }
  if (!PLATFORM_TENANT_ID) {
    throw new Error('Missing WHATSAPP_PLATFORM_TENANT_ID in .env.local');
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: templates, error } = await db
    .schema('app')
    .from('whatsapp_templates')
    .select('id, meta_template_name, meta_category, locale, variables, header_config, buttons_config')
    .is('tenant_id', null)
    .is('deleted_at', null)
    .eq('approval_status', 'approved')
    .order('meta_template_name');

  if (error) throw new Error(`Failed to load templates: ${error.message}`);
  if (!templates?.length) throw new Error('No approved platform templates found');

  console.log(`Recipient: ${recipientPhone}`);
  console.log(`Templates: ${templates.map((t) => t.meta_template_name).join(', ')}`);
  if (dryRun) {
    for (const template of templates) {
      console.log(`\n--- ${template.meta_template_name} ---`);
      console.log(JSON.stringify(buildSendPayload(template), null, 2));
    }
    return;
  }

  const enqueued = [];

  for (const template of templates) {
    const routing = TRIGGER_BY_TEMPLATE[template.meta_template_name];
    if (!routing?.tenantId) {
      console.warn(`Skipping ${template.meta_template_name}: no routing config`);
      continue;
    }

    const sendPayload = buildSendPayload(template);
    const relatedEntityId = routing.relatedEntityType ? randomUUID() : null;

    const { data: message, error: insertError } = await db
      .schema('app')
      .from('whatsapp_messages')
      .insert({
        tenant_id: routing.tenantId,
        recipient_phone: recipientPhone,
        whatsapp_template_id: template.id,
        meta_category: template.meta_category,
        trigger_source: routing.triggerSource,
        status: 'queued',
        send_payload: sendPayload,
        related_entity_type: routing.relatedEntityType ?? null,
        related_entity_id: relatedEntityId,
      })
      .select('id')
      .single();

    if (insertError || !message?.id) {
      throw new Error(`Failed to enqueue ${template.meta_template_name}: ${insertError?.message ?? 'unknown'}`);
    }

    const { error: queueError } = await db
      .schema('app')
      .from('whatsapp_send_queue')
      .insert({
        tenant_id: routing.tenantId,
        whatsapp_message_id: message.id,
        priority: routing.priority,
        scheduled_send_at: new Date().toISOString(),
      });

    if (queueError) {
      throw new Error(`Failed to queue ${template.meta_template_name}: ${queueError.message}`);
    }

    enqueued.push({ template: template.meta_template_name, messageId: message.id });
    console.log(`Queued ${template.meta_template_name} → ${message.id}`);
  }

  console.log('\nTriggering dispatch worker...');
  const dispatchResult = await triggerDispatch(enqueued.map((row) => row.messageId));
  console.log('Dispatch result:', JSON.stringify(dispatchResult, null, 2));

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const messageIds = enqueued.map((row) => row.messageId);
  const { data: statuses, error: statusError } = await db
    .schema('app')
    .from('whatsapp_messages')
    .select('id, meta_category, trigger_source, status, provider_message_id, failure_reason, send_payload')
    .in('id', messageIds);

  if (statusError) {
    console.warn('Could not fetch final statuses:', statusError.message);
    return;
  }

  console.log('\nFinal message statuses:');
  for (const row of statuses ?? []) {
    const name = row.send_payload?.meta_template_name ?? 'unknown';
    console.log(`- ${name}: ${row.status}${row.provider_message_id ? ` (wamid: ${row.provider_message_id})` : ''}${row.failure_reason ? ` — ${row.failure_reason}` : ''}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
