#!/usr/bin/env bash
# Export TBX artifacts from admin projects and validate with jing (manual / CI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/tests/output/tbx"
SCHEMA="$ROOT/reference/tbx/schemas/TBXBasicRNGV02.rng"
DATABASE_URL="${DATABASE_URL:-file:./prisma/database.sqlite}"
JWT_SECRET="${JWT_SECRET:-super-secret-hackathon-key}"
ADMIN_USER_ID="f06913c5-4128-4d13-ab32-ba462b6caf55"

mkdir -p "$OUT_DIR"

echo "Exporting TBX artifacts to $OUT_DIR ..."
DATABASE_URL="$DATABASE_URL" JWT_SECRET="$JWT_SECRET" ADMIN_USER_ID="$ADMIN_USER_ID" OUT_DIR="$OUT_DIR" \
  npx tsx "$ROOT/scripts/exportTbxArtifacts.ts"

if ! command -v jing >/dev/null 2>&1; then
  echo "jing not found — skipping RNG validation. Install jing to validate against TBXBasicRNGV02.rng."
  exit 0
fi

echo "Validating exported files with jing ..."
failed=0
for file in "$OUT_DIR"/*.tbx; do
  [ -f "$file" ] || continue
  echo "  jing $SCHEMA $(basename "$file")"
  if ! jing "$SCHEMA" "$file"; then
    failed=1
  fi
done

if [ "$failed" -ne 0 ]; then
  echo "One or more TBX files failed RNG validation."
  exit 1
fi

echo "All exported TBX files passed jing validation."
