#!/usr/bin/env node
'use strict';

const { Client } = require('pg');

const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.DB_USER || 'mrmohammed',
    password: process.env.DB_PASS || 'youruncletruepassword',
    database: process.env.DB_NAME || 'ecommerce_database_for_the_legends_of_the_workd',
});

const checks = [];

function record(name, passed, detail) {
    checks.push({ name, passed, detail });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function checkNegativeStock() {
    const { rows } = await client.query(`SELECT id, name, stock FROM products WHERE stock < 0`);
    record(
        'No product has negative stock (no overselling)',
        rows.length === 0,
        rows.length ? JSON.stringify(rows) : undefined,
    );
}

async function checkNegativeBalance() {
    const { rows } = await client.query(
        `SELECT id, email, balance FROM users WHERE balance::numeric < 0`,
    );
    record(
        'No user has a negative wallet balance',
        rows.length === 0,
        rows.length ? JSON.stringify(rows) : undefined,
    );
}

async function checkDuplicateIdempotencyKeys() {
    const { rows } = await client.query(`
        SELECT "idempotencyKey", COUNT(*) c FROM orders
        WHERE "idempotencyKey" IS NOT NULL
        GROUP BY "idempotencyKey" HAVING COUNT(*) > 1
    `);
    record(
        'No duplicate orders share an idempotency key',
        rows.length === 0,
        rows.length ? JSON.stringify(rows) : undefined,
    );
}

async function checkWalletChainIntegrity() {
    const { rows } = await client.query(`
        SELECT wt."userId", wt.id, wt.type, wt.amount, wt."balanceBefore", wt."balanceAfter", wt."createdAt", wt.note
        FROM wallet_transactions wt
        JOIN users u ON u.id = wt."userId"
        WHERE u.email LIKE 'testuser%'
        ORDER BY wt."userId", wt."createdAt" ASC, wt.id ASC
    `);

    const byUser = new Map();
    for (const row of rows) {
        if (!byUser.has(row.userId)) byUser.set(row.userId, []);
        byUser.get(row.userId).push(row);
    }

    const broken = [];
    const brokenDetails = [];
    for (const [userId, txns] of byUser) {
        for (let i = 1; i < txns.length; i++) {
            const prevAfter = Number(txns[i - 1].balanceAfter);
            const curBefore = Number(txns[i].balanceBefore);
            if (Math.abs(prevAfter - curBefore) > 0.01) {
                broken.push({ userId, brokenAt: txns[i].id });
                brokenDetails.push(
                    `user=${userId} tx=${txns[i].id} prevAfter=${prevAfter} curBefore=${curBefore}`,
                );
            }
        }
    }

    record(
        'Every wallet transaction chain is unbroken (balanceAfter[N] == balanceBefore[N+1])',
        broken.length === 0,
        broken.length ? brokenDetails.join('; ') : undefined,
    );
}

async function checkStressProductIntegrity() {
    const { rows: products } = await client.query(`
        SELECT id, name, stock FROM products WHERE name LIKE 'Seed Stress Product %'
    `);
    if (products.length === 0) {
        record('Stress product stock matches sales', true, 'no stress products found — SKIPPED');
        return;
    }

    const { rows: orders } = await client.query(`
        SELECT oi."productId", SUM(oi.quantity) AS total_sold
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o.status = 'completed'
        AND oi."productId" = ANY($1::uuid[])
        GROUP BY oi."productId"
    `, [products.map(p => p.id)]);

    const soldMap = {};
    for (const row of orders) {
        soldMap[row.productId] = Number(row.total_sold);
    }

    const mismatches = [];
    for (const p of products) {
        const expectedStock = 10000;
        const sold = soldMap[p.id] || 0;
        const actualStock = Number(p.stock);
        if (expectedStock - sold !== actualStock) {
            mismatches.push(`${p.name}: initial=10000 sold=${sold} actual=${actualStock} expected=${expectedStock - sold}`);
        }
    }

    record(
        'Every stress product stock = 10000 - completed orders (no stock leakage)',
        mismatches.length === 0,
        mismatches.length ? mismatches.join('; ') : undefined,
    );
}

async function checkOrderTotalsMatchItems() {
    const { rows } = await client.query(`
        SELECT o.id, o."totalAmount",
            COALESCE(SUM(oi.quantity * oi."priceAtTime"::numeric), 0) AS computed
        FROM orders o
        LEFT JOIN order_items oi ON oi."orderId" = o.id
        WHERE o.status = 'completed'
        GROUP BY o.id, o."totalAmount"
        HAVING ABS(o."totalAmount"::numeric - COALESCE(SUM(oi.quantity * oi."priceAtTime"::numeric), 0)) > 0.01
    `);
    record(
        'Every completed order total matches the sum of its line items',
        rows.length === 0,
        rows.length ? JSON.stringify(rows) : undefined,
    );
}

async function main() {
    await client.connect();
    try {
        await checkNegativeStock();
        await checkNegativeBalance();
        await checkDuplicateIdempotencyKeys();
        await checkWalletChainIntegrity();
        await checkStressProductIntegrity();
        await checkOrderTotalsMatchItems();
    } finally {
        await client.end();
    }

    const allPassed = checks.every((c) => c.passed);
    const passedCount = checks.filter((c) => c.passed).length;
    const totalCount = checks.length;
    console.log(`\nIntegrity: ${passedCount}/${totalCount} checks passed`);
    console.log(`Overall: ${allPassed ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`);
    process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
    console.error('Integrity check crashed:', err);
    process.exit(1);
});
