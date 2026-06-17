#!/usr/bin/env bash
# Reset test data for a clean run, preserving wallet/order integrity chain.
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_USER="${DB_USER:-mrmohammed}"
DB_PASS="${DB_PASS:-youruncletruepassword}"
DB_NAME="${DB_NAME:-ecommerce_database_for_the_legends_of_the_workd}"

echo "Resetting test data..."

psql_exec() {
    PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "$1"
}

# 1. Nullify walletTransactionId FK references from orders (so wallet txns can be deleted)
psql_exec "
UPDATE orders SET \"walletTransactionId\" = NULL
WHERE \"walletTransactionId\" IN (
    SELECT wt.id FROM wallet_transactions wt
    JOIN users u ON u.id = wt.\"userId\"
    WHERE u.email LIKE 'testuser%'
);
"

# 2. Delete wallet transactions for test users (wallet chain stays clean)
psql_exec "
DELETE FROM wallet_transactions wt
USING users u
WHERE wt.\"userId\" = u.id
  AND u.email LIKE 'testuser%';
"

# 3. Delete order_items for stress product orders (so stock check passes)
psql_exec "
DELETE FROM order_items oi
USING products p
WHERE oi.\"productId\" = p.id
  AND p.name LIKE 'Seed Stress Product %';
"

# 4. Reset stock to 10000 for stress products
psql_exec "
UPDATE products SET stock = 10000 WHERE name LIKE 'Seed Stress Product %';
"

# 5. Reset balance to 100.00 for test users
psql_exec "
UPDATE users SET balance = '999999.99' WHERE email LIKE 'testuser%';
"

echo "Done."
