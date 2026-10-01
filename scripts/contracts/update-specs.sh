#!/usr/bin/env bash
# Update contract-spec JSON fixtures from compiled WASMs (#719).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES_DIR="$REPO_ROOT/src/test/fixtures/contracts"
CONTRACTS_DIR="${CONTRACTS_DIR:-$REPO_ROOT/.e2e/contracts}"
CONTRACTS_REF="${CONTRACTS_REF:-main}"

mkdir -p "$FIXTURES_DIR"

if [ -n "${CONTRACTS_WASM_DIR:-}" ]; then
  WASM_DIR="$CONTRACTS_WASM_DIR"
else
  if [ ! -d "$CONTRACTS_DIR/.git" ]; then
    echo "Cloning Heliobond/contracts@$CONTRACTS_REF into $CONTRACTS_DIR..."
    git clone --depth 1 --branch "$CONTRACTS_REF" https://github.com/Heliobond/contracts "$CONTRACTS_DIR"
  fi
  WASM_DIR="$CONTRACTS_DIR/target/wasm32v1-none/release"
  if [ ! -f "$WASM_DIR/project_registry.wasm" ] || [ ! -f "$WASM_DIR/investment_vault.wasm" ]; then
    echo "Building WASMs in $CONTRACTS_DIR..."
    (cd "$CONTRACTS_DIR" && stellar contract build)
  fi
fi

echo "Extracting contract interface specs..."
stellar contract info interface --wasm "$WASM_DIR/project_registry.wasm" --output json-formatted > "$FIXTURES_DIR/project_registry.spec.json"
stellar contract info interface --wasm "$WASM_DIR/investment_vault.wasm" --output json-formatted > "$FIXTURES_DIR/investment_vault.spec.json"

COMMIT_SHA="unknown"
if [ -d "$CONTRACTS_DIR/.git" ]; then
  COMMIT_SHA=$(cd "$CONTRACTS_DIR" && git rev-parse HEAD)
fi

cat <<EOF > "$FIXTURES_DIR/contracts-commit.ts"
/**
 * Pinned commit SHA of Heliobond/contracts used to generate the spec fixtures (#719).
 */
export const CONTRACTS_COMMIT_SHA = '$COMMIT_SHA'
EOF

echo "✅ Contract spec fixtures updated from $COMMIT_SHA in $FIXTURES_DIR"
