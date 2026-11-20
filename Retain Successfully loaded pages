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

log "Extracting contract specifications via stellar CLI"
stellar contract info interface --wasm "$WASM_DIR/investment_vault.wasm" --output json-formatted > "$OUT_DIR/investment_vault.spec.json"
stellar contract info interface --wasm "$WASM_DIR/project_registry.wasm" --output json-formatted > "$OUT_DIR/project_registry.spec.json"

printf '%s\n' "$COMMIT_SHA" > "$OUT_DIR/COMMIT_SHA"

log "Successfully updated contract-spec fixtures in $OUT_DIR (commit $COMMIT_SHA)"
