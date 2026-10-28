#!/usr/bin/env bash
set -euo pipefail
version="$(pg_lsclusters --no-header | awk 'NR==1 {print $1}')"
test -n "$version" || { echo 'PostgreSQL is not installed in WSL.' >&2; exit 1; }
if ! pg_ctlcluster "$version" main status >/dev/null 2>&1; then
  pg_ctlcluster "$version" main start
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'msme_dev') THEN
    CREATE ROLE msme_dev LOGIN PASSWORD 'devpassword' CREATEDB;
  END IF;
END $$;
SQL
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='msme_marketplace'" | grep -q 1; then
  runuser -u postgres -- createdb -O msme_dev msme_marketplace
fi
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d msme_marketplace -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'
echo 'Local PostgreSQL ready on port 5432.'
