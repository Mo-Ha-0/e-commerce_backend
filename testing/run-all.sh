#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "Installing dependencies..."
npm install --no-audit --no-fund --silent

mkdir -p results
TS=$(date +%Y%m%d-%H%M%S)

echo ""
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║       ShopFlow — Full Concurrency & Stress Test Suite           ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo ""
echo "Target: ${BASE_URL:-http://localhost:8080}"
echo ""

echo "=== Step 1: Reset test data (clean wallet chain + stock) ==="
bash reset-data.sh
echo ""

echo "=== Step 2: Run load test ==="
node load-test.js all 2>&1 | tee "results/load-test-$TS.log"
echo ""

echo "=== Step 3: Verify data integrity ==="
node verify-integrity.js 2>&1 | tee "results/integrity-$TS.log"
echo ""

echo "=== Step 4: Summary ==="
echo "Logs:"
echo "  testing/results/load-test-$TS.log"
echo "  testing/results/integrity-$TS.log"
echo ""
echo "Done."
