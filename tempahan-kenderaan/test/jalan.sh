#!/usr/bin/env bash
# Bina semula pangkalan data ujian tempatan dan jalankan ujian aliran kerja.
set -euo pipefail
cd "$(dirname "$0")/.."
D="$PWD"
su postgres -c "psql -q -c 'drop database if exists vbtest' -c 'create database vbtest'" 2>/dev/null
su postgres -c "psql -q -v ON_ERROR_STOP=1 -d vbtest -f $D/test/mock_supabase.sql -f $D/supabase/migrations/001_skema.sql" >/dev/null
su postgres -c "psql -t -A -d vbtest -f $D/test/uji_aliran.sql" 2>&1 | grep -E '^(LULUS|GAGAL|[0-9]+\|)|ERROR' || true
