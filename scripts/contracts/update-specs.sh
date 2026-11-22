#!/usr/bin/env bash
# Update contract-spec JSON fixtures from Heliobond/contracts (#719).
#
# Generates:
#   src/test/fixtures/contracts/investment_vault.spec.json
#   src/test/fixtures/contracts/project_registry.spec.json
#   src/test/fixtures/contracts/COMMIT_SHA
#
# Usage:
#   # Using prebuilt WASMs (fastest, matches e2e setup):
#   CONTRACTS_WASM_DIR=/path/to/wasm ./scripts/contracts/update-specs.sh
#
#   # Or building directly from Heliobond/contracts git repository:
#   CONTRACTS_REF=main ./scripts/contracts/update-specs.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

CONTRACTS_DIR="${CONTRACTS_DIR:-$REPO_ROOT/.e2e/contracts}"
CONTRACTS_REF="${CONTRACTS_REF:-main}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/src/test/fixtures/contracts}"
LOCAL_WASM_DIR="$REPO_ROOT/../contracts/target/wasm32-unknown-unknown/release"

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

mkdir -p "$OUT_DIR"

if [ -n "${CONTRACTS_WASM_DIR:-}" ] || [ -f "$LOCAL_WASM_DIR/investment_vault.wasm" ]; then
  WASM_DIR="${CONTRACTS_WASM_DIR:-$LOCAL_WASM_DIR}"
  log "Using prebuilt WASMs from $WASM_DIR"
  if [ -d "$WASM_DIR/../../../.git" ]; then
    COMMIT_SHA="$(cd "$WASM_DIR/../../.." && git rev-parse HEAD 2>/dev/null || echo "$CONTRACTS_REF")"
  else
    COMMIT_SHA="${CONTRACTS_COMMIT_SHA:-$CONTRACTS_REF}"
  fi
else
  log "Checking/cloning Heliobond/contracts@$CONTRACTS_REF"
  if [ ! -d "$CONTRACTS_DIR/.git" ]; then
    mkdir -p "$(dirname "$CONTRACTS_DIR")"
    git clone --depth 1 --branch "$CONTRACTS_REF" https://github.com/Heliobond/contracts "$CONTRACTS_DIR"
  else
    (cd "$CONTRACTS_DIR" && git fetch origin "$CONTRACTS_REF" && git checkout "$CONTRACTS_REF")
  fi
  COMMIT_SHA="$(cd "$CONTRACTS_DIR" && git rev-parse HEAD)"

  log "Building contracts in $CONTRACTS_DIR"
  (cd "$CONTRACTS_DIR" && stellar contract build)
  WASM_DIR="$CONTRACTS_DIR/target/wasm32-unknown-unknown/release"
  if [ ! -d "$WASM_DIR" ]; then
    WASM_DIR="$CONTRACTS_DIR/target/wasm32v1-none/release"
  fi
fi

for wasm in investment_vault project_registry; do
  WASM_FILE="$WASM_DIR/$wasm.wasm"
  if [ ! -f "$WASM_FILE" ]; then
    echo "Error: missing required contract WASM: $WASM_FILE" >&2
    exit 1
  fi
done

# Stage every file in a temporary directory first and publish the finished set
# together (#1038). Redirecting straight into the final paths would truncate a
# checked-in fixture if an export failed, or leave the vault and registry specs
# from different exports next to the old COMMIT_SHA.
# The staging directory lives inside OUT_DIR so publishing is a same-filesystem
# rename, not a copy.
FIXTURES=(investment_vault.spec.json project_registry.spec.json COMMIT_SHA)
STAGE_DIR="$(mktemp -d "$OUT_DIR/.stage.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

log "Extracting contract specifications via stellar CLI"
stellar contract info interface --wasm "$WASM_DIR/investment_vault.wasm" --output json-formatted > "$STAGE_DIR/investment_vault.spec.json"
stellar contract info interface --wasm "$WASM_DIR/project_registry.wasm" --output json-formatted > "$STAGE_DIR/project_registry.spec.json"
printf '%s
' "$COMMIT_SHA" > "$STAGE_DIR/COMMIT_SHA"

log "Validating staged fixtures"
for spec in investment_vault project_registry; do
  staged="$STAGE_DIR/$spec.spec.json"
  if [ ! -s "$staged" ]; then
    echo "Error: $spec export is empty; leaving existing fixtures untouched" >&2
    exit 1
  fi
  if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$staged"; then
    echo "Error: $spec export is not valid JSON; leaving existing fixtures untouched" >&2
    exit 1
  fi
done
if [ ! -s "$STAGE_DIR/COMMIT_SHA" ]; then
  echo "Error: COMMIT_SHA is empty; leaving existing fixtures untouched" >&2
  exit 1
fi

log "Publishing fixtures"
BACKUP_DIR="$STAGE_DIR/backup"
mkdir -p "$BACKUP_DIR"
for f in "${FIXTURES[@]}"; do
  if [ -f "$OUT_DIR/$f" ]; then cp -p "$OUT_DIR/$f" "$BACKUP_DIR/$f"; fi
done

rollback() {
  echo "Error: publishing failed; restoring previous fixtures" >&2
  for f in "${FIXTURES[@]}"; do
    if [ -f "$BACKUP_DIR/$f" ]; then mv -f "$BACKUP_DIR/$f" "$OUT_DIR/$f"; else rm -f "$OUT_DIR/$f"; fi
  done
}

for f in "${FIXTURES[@]}"; do
  if ! mv -f "$STAGE_DIR/$f" "$OUT_DIR/$f"; then
    rollback
    exit 1
  fi
done

log "Successfully updated contract-spec fixtures in $OUT_DIR (commit $COMMIT_SHA)"
