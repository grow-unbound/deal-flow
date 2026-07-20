#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <user_id> <new_phone> [project_ref]"
  echo "Example: $0 550e8400-e29b-41d4-a716-446655440701 9441479687 hcpzbnmumbykdqveyjhr"
  exit 1
fi

USER_ID="$1"
NEW_PHONE="$2"
PROJECT_REF="${3:-hcpzbnmumbykdqveyjhr}"

if [[ ! -f .env.local ]]; then
  echo ".env.local not found in current directory"
  exit 1
fi

set -a
source .env.local
set +a

if [[ -z "${DATABASE_PASSWORD:-}" ]]; then
  echo "DATABASE_PASSWORD is missing in .env.local"
  exit 1
fi

HOST="aws-1-ap-northeast-2.pooler.supabase.com"
DB_USER="postgres.${PROJECT_REF}"

export PGPASSWORD="$DATABASE_PASSWORD"

psql -X -v ON_ERROR_STOP=1 \
  -h "$HOST" \
  -p 5432 \
  -U "$DB_USER" \
  -d postgres <<SQL
update auth.users
set phone = '${NEW_PHONE}',
    raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{phone}',
      to_jsonb('${NEW_PHONE}'::text),
      true
    )
where id = '${USER_ID}';

select id, phone, raw_user_meta_data->>'phone' as meta_phone
from auth.users
where id = '${USER_ID}';
SQL