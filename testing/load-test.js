#!/usr/bin/env node
'use strict';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const PASSWORD = 'password123';
const TEST_USER_COUNT = Number(process.env.TEST_USER_COUNT || 300);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'superadmin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || PASSWORD;

const tokenCache = new Map();

function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
}

function summarize(records) {
    const latencies = records.map((r) => r.ms).sort((a, b) => a - b);
    const byStatus = {};
    let serverErrors = 0;
    for (const r of records) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        if (r.status >= 500) serverErrors++;
    }
    const success = records.filter((r) => r.status >= 200 && r.status < 300).length;
    const sum = latencies.reduce((a, b) => a + b, 0);
    return {
        total: records.length,
        success,
        clientErrors: records.filter((r) => r.status >= 400 && r.status < 500).length,
        serverErrors,
        failed: records.length - success,
        errorRatePct: records.length
            ? (((records.length - success) / records.length) * 100).toFixed(2)
            : '0.00',
        serverErrorRatePct: records.length
            ? ((serverErrors / records.length) * 100).toFixed(2)
            : '0.00',
        minMs: latencies[0] || 0,
        avgMs: latencies.length ? Math.round(sum / latencies.length) : 0,
        p50Ms: percentile(latencies, 50),
        p95Ms: percentile(latencies, 95),
        p99Ms: percentile(latencies, 99),
        maxMs: latencies[latencies.length - 1] || 0,
        byStatus,
    };
}

async function call(method, path, { token, body, headers } = {}) {
    const t0 = Date.now();
    let status = 0;
    let json = null;
    try {
        const res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(headers || {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        status = res.status;
        try { json = await res.json(); }
        catch { json = null; }
    } catch (err) {
        status = 0;
        json = { networkError: String(err) };
    }
    return { ms: Date.now() - t0, status, ok: status >= 200 && status < 300, json };
}

async function login(email, password = PASSWORD) {
    if (tokenCache.has(email)) return tokenCache.get(email);
    const res = await call('POST', '/auth/login', { body: { email, password } });
    if (!res.ok) {
        throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.json)}`);
    }
    tokenCache.set(email, res.json.accessToken);
    return res.json.accessToken;
}

async function findProductByName(token, name) {
    for (let page = 1; page <= 10; page++) {
        const res = await call('GET', `/products?page=${page}&limit=50`, { token });
        if (!res.ok) throw new Error(`Failed to list products: ${res.status}`);
        const found = res.json.items.find((p) => p.name === name);
        if (found) return found;
        if (res.json.items.length === 0) break;
    }
    return null;
}

async function fetchAllStressProducts(token) {
    const map = {};
    for (let page = 1; page <= 5; page++) {
        const res = await call('GET', `/products?page=${page}&limit=100`, { token });
        if (!res.ok) break;
        const items = res.json.items ?? res.json.data ?? [];
        if (items.length === 0) break;
        for (const p of items) {
            const match = p.name.match(/^Seed Stress Product (\d+)$/);
            if (match) map[Number(match[1])] = p;
        }
    }
    return map;
}

function printTable(title, stats, extra) {
    console.log(`\n=== ${title} ===`);
    console.log(
        `requests: ${stats.total}  success: ${stats.success}  ` +
        `4xx: ${stats.clientErrors}  5xx: ${stats.serverErrors}  ` +
        `server-error-rate: ${stats.serverErrorRatePct}%`,
    );
    console.log(
        `latency ms — min:${stats.minMs} avg:${stats.avgMs} p50:${stats.p50Ms} p95:${stats.p95Ms} p99:${stats.p99Ms} max:${stats.maxMs}`,
    );
    if (extra) console.log(extra);
    if (Object.keys(stats.byStatus).length) {
        console.log('by status:', JSON.stringify(stats.byStatus));
    }
}

// ---------- Scenario A: smoke — realistic concurrent sessions ----------
async function scenarioSmoke() {
    const concurrency = Number(process.env.SMOKE_CONCURRENCY || 200);
    const records = [];

    await Promise.allSettled(
        Array.from({ length: concurrency }, (_, i) => i).map(async (i) => {
            const idx = (i % TEST_USER_COUNT) + 1;
            const email = `testuser${idx}@test.com`;

            const loginRes = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
            records.push({ ms: loginRes.ms, status: loginRes.status, ok: loginRes.ok });
            if (!loginRes.ok) return;
            const token = loginRes.json.accessToken;

            const products = await call('GET', '/products?limit=20', { token });
            records.push({ ms: products.ms, status: products.status, ok: products.ok });

            const cart = await call('GET', '/cart', { token });
            records.push({ ms: cart.ms, status: cart.status, ok: cart.ok });

            const health = await call('GET', '/health');
            records.push({ ms: health.ms, status: health.status, ok: health.ok });
        }),
    );

    const stats = summarize(records);
    printTable(`Scenario A — Smoke (${concurrency} simultaneous user sessions)`, stats);
    return { name: 'smoke', concurrency, stats };
}

// ---------- Scenario B: sustained throughput ----------
async function scenarioSustained() {
    const concurrency = Number(process.env.SUSTAINED_CONCURRENCY || 200);
    const durationSec = Number(process.env.SUSTAINED_DURATION_SEC || 30);
    const records = [];
    const stop = Date.now() + durationSec * 1000;

    async function worker() {
        while (Date.now() < stop) {
            const r = await call('GET', '/health');
            records.push({ ms: r.ms, status: r.status, ok: r.ok });
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));

    const stats = summarize(records);
    printTable(`Scenario B — Sustained load (${concurrency} concurrent workers for ${durationSec}s)`, stats);
    return { name: 'sustained', concurrency, durationSec, stats };
}

// ---------- Scenario C: race condition (overselling) ----------
async function scenarioRace() {
    const raceUsers = Number(process.env.RACE_USERS || 100);
    const productName = process.env.RACE_PRODUCT_NAME || 'Seed Race Condition Product';

    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const product = await findProductByName(adminToken, productName);
    if (!product) {
        console.log('\n=== Scenario C — Race condition ===');
        console.log(`SKIPPED: product "${productName}" not found. Run the seed script first.`);
        return { name: 'race', skipped: true };
    }

    if (raceUsers > TEST_USER_COUNT) {
        throw new Error(`RACE_USERS (${raceUsers}) exceeds TEST_USER_COUNT (${TEST_USER_COUNT})`);
    }

    await call('PATCH', `/inventory/${product.id}`, {
        token: adminToken,
        body: { stock: 1, reason: 'stress-test-reset' },
    });

    const emails = Array.from({ length: raceUsers }, (_, i) => `testuser${i + 1}@test.com`);
    const tokens = await Promise.all(emails.map((e) => login(e)));

    await Promise.all(
        tokens.map(async (token) => {
            await call('DELETE', '/cart', { token });
            await call('POST', '/cart/items', {
                token,
                body: { productId: product.id, quantity: 1 },
            });
        }),
    );

    const checkoutResults = await Promise.allSettled(
        tokens.map((token, i) =>
            call('POST', '/orders', {
                token,
                headers: { 'Idempotency-Key': `race-${Date.now()}-${i}` },
            }),
        ),
    );

    const records = checkoutResults.map((r) =>
        r.status === 'fulfilled' ? r.value : { ms: 0, status: 0, ok: false },
    );
    const successes = records.filter((r) => r.ok);
    const failures = records.filter((r) => !r.ok);
    const serverErrors = records.filter((r) => r.status >= 500).length;

    const finalProduct = await call('GET', `/products/${product.id}`);
    const finalStock = finalProduct.json?.stock;

    const overSold = finalStock < 0 || successes.length > 1;
    const passed = !overSold && serverErrors === 0;

    console.log(`\n=== Scenario C — Race condition (${raceUsers} simultaneous buyers, stock=1) ===`);
    console.log(`successful checkouts: ${successes.length} (expected: 1)`);
    console.log(`rejected checkouts:   ${failures.length} (expected: ${raceUsers - 1})`);
    console.log(`final stock:          ${finalStock} (expected: 0)`);
    console.log(`server errors (5xx):  ${serverErrors}`);
    console.log(`OVERSELLING DETECTED: ${overSold ? 'YES — FAIL' : 'no — PASS'}`);

    return {
        name: 'race',
        raceUsers,
        successfulCheckouts: successes.length,
        rejectedCheckouts: failures.length,
        serverErrors,
        finalStock,
        overSold,
        passed,
    };
}

// ---------- Scenario D: concurrent wallet writes ----------
async function scenarioWallet() {
    const concurrency = Number(process.env.WALLET_CONCURRENCY || 50);
    const depositAmount = 10;
    const targetEmail = process.env.WALLET_TEST_EMAIL || 'testuser1@test.com';

    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const userToken = await login(targetEmail);
    const me = await call('GET', '/auth/me', { token: userToken });
    const userId = me.json.id;

    const before = await call('GET', `/wallet/admin/users/${userId}`, { token: adminToken });
    const initialBalance = Number(before.json.balance);

    const deposits = await Promise.allSettled(
        Array.from({ length: concurrency }, () =>
            call('POST', `/wallet/admin/users/${userId}/deposit`, {
                token: adminToken,
                body: { amount: depositAmount, note: 'stress-test-deposit' },
            }),
        ),
    );

    const records = deposits.map((r) =>
        r.status === 'fulfilled' ? r.value : { ms: 0, status: 0, ok: false },
    );
    const successCount = records.filter((r) => r.ok).length;
    const serverErrors = records.filter((r) => r.status >= 500).length;

    const after = await call('GET', `/wallet/admin/users/${userId}`, { token: adminToken });
    const finalBalance = Number(after.json.balance);
    const expectedBalance = Number((initialBalance + successCount * depositAmount).toFixed(2));

    const lostUpdate = Math.abs(finalBalance - expectedBalance) > 0.01;
    const passed = !lostUpdate && serverErrors === 0;

    console.log(`\n=== Scenario D — Concurrent wallet writes (${concurrency} simultaneous deposits, same user) ===`);
    console.log(`initial balance:     ${initialBalance}`);
    console.log(`successful deposits: ${successCount}/${concurrency}`);
    console.log(`server errors (5xx): ${serverErrors}`);
    console.log(`final balance:       ${finalBalance} (expected: ${expectedBalance})`);
    console.log(`LOST UPDATE DETECTED: ${lostUpdate ? 'YES — FAIL' : 'no — PASS'}`);

    return {
        name: 'wallet',
        concurrency,
        initialBalance,
        successCount,
        serverErrors,
        finalBalance,
        expectedBalance,
        lostUpdate,
        passed,
    };
}

// ---------- Scenario E: checkout barrage — N users, per-user products, sustained buy cycle ----------
async function scenarioCheckoutBarrage() {
    const concurrency = Number(process.env.BARRAGE_CONCURRENCY || 200);
    const durationSec = Number(process.env.BARRAGE_DURATION_SEC || 30);
    const records = [];
    const checkoutStats = { success: 0, rejected: 0, serverErrors: 0, latencies: [] };
    const stop = Date.now() + durationSec * 1000;

    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const productMap = await fetchAllStressProducts(adminToken);
    const productCount = Object.keys(productMap).length;
    if (productCount < 1) {
        console.log('\n=== Scenario E — Checkout barrage ===');
        console.log('SKIPPED: no stress products found.');
        return { name: 'checkout-barrage', skipped: true };
    }

    async function worker(userIndex) {
        const idx = userIndex + 1;
        const email = `testuser${idx}@test.com`;
        const pid = (idx % productCount) + 1;
        const product = productMap[pid];
        if (!product) return;

        const token = await login(email);
        await call('DELETE', '/cart', { token });
        await call('POST', '/cart/items', {
            token,
            body: { productId: product.id, quantity: 1 },
        });

        while (Date.now() < stop) {
            const checkout = await call('POST', '/orders', { token });
            records.push({ ms: checkout.ms, status: checkout.status, ok: checkout.ok });

            if (checkout.status === 201) {
                checkoutStats.success++;
                checkoutStats.latencies.push(checkout.ms);
                await call('POST', '/cart/items', {
                    token,
                    body: { productId: product.id, quantity: 1 },
                });
            } else if (checkout.status === 400) {
                checkoutStats.rejected++;
                const cart = await call('GET', '/cart', { token });
                if (cart.status === 200) {
                    if (cart.json?.items?.length === 0) {
                        await call('POST', '/cart/items', {
                            token,
                            body: { productId: product.id, quantity: 1 },
                        });
                    }
                }
            } else if (checkout.status >= 500) {
                checkoutStats.serverErrors++;
            }
        }
    }

    await Promise.allSettled(
        Array.from({ length: concurrency }, (_, i) => worker(i)),
    );

    const stats = summarize(records);
    const checkoutLatencies = checkoutStats.latencies.sort((a, b) => a - b);
    const checkoutSummary = {
        total: checkoutStats.success + checkoutStats.rejected + checkoutStats.serverErrors,
        success: checkoutStats.success,
        rejected: checkoutStats.rejected,
        serverErrors: checkoutStats.serverErrors,
        p50Ms: percentile(checkoutLatencies, 50),
        p95Ms: percentile(checkoutLatencies, 95),
        avgMs: checkoutLatencies.length
            ? Math.round(checkoutLatencies.reduce((a, b) => a + b, 0) / checkoutLatencies.length)
            : 0,
    };

    printTable(
        `Scenario E — Checkout barrage (${concurrency} users × ${durationSec}s)`,
        stats,
        `checkout — success:${checkoutSummary.success} rejected:${checkoutSummary.rejected} ` +
        `5xx:${checkoutSummary.serverErrors} p50/avg/p95:${checkoutSummary.p50Ms}/${checkoutSummary.avgMs}/${checkoutSummary.p95Ms}ms`,
    );

    return {
        name: 'checkout-barrage',
        concurrency,
        durationSec,
        stats,
        checkoutStats: checkoutSummary,
        passed: checkoutSummary.serverErrors === 0,
    };
}

// ---------- Scenario F: checkout burst — N simultaneous checkouts, each with own product ----------
async function scenarioCheckoutBurst() {
    const burstUsers = Number(process.env.BURST_USERS || 300);
    if (burstUsers > TEST_USER_COUNT * 3) {
        console.log(`\n=== Scenario F — Checkout burst ===`);
        console.log(`SKIPPED: BURST_USERS (${burstUsers}) exceeds capacity (TEST_USER_COUNT * 3 = ${TEST_USER_COUNT * 3})`);
        return { name: 'checkout-burst', skipped: true };
    }

    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    const productMap = await fetchAllStressProducts(adminToken);
    const productCount = Object.keys(productMap).length;
    if (productCount < 1) {
        console.log('\n=== Scenario F — Checkout burst ===');
        console.log('SKIPPED: no stress products found.');
        return { name: 'checkout-burst', skipped: true };
    }

    const emails = Array.from(
        { length: burstUsers },
        (_, i) => `testuser${i + 1}@test.com`,
    );

    const sessions = await Promise.all(
        emails.map(async (email, i) => {
            const token = await login(email);
            const pid = (i % productCount) + 1;
            const product = productMap[pid];
            return { token, product, email };
        }),
    );

    await Promise.all(
        sessions.map(async (s) => {
            await call('DELETE', '/cart', { token: s.token });
            await call('POST', '/cart/items', {
                token: s.token,
                body: { productId: s.product.id, quantity: 1 },
            });
        }),
    );

    const results = await Promise.allSettled(
        sessions.map((s, i) =>
            call('POST', '/orders', {
                token: s.token,
                headers: { 'Idempotency-Key': `burst-${Date.now()}-${i}` },
            }),
        ),
    );

    const records = results.map((r) =>
        r.status === 'fulfilled' ? r.value : { ms: 0, status: 0, ok: false },
    );
    const successes = records.filter((r) => r.ok);
    const failures = records.filter((r) => !r.ok);
    const serverErrors = records.filter((r) => r.status >= 500).length;
    const byStatus = {};
    for (const r of records) {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }

    const stats = summarize(records);
    console.log(`\n=== Scenario F — Checkout burst (${burstUsers} simultaneous checkouts) ===`);
    console.log(`successful: ${successes.length}  rejected: ${failures.length}  5xx: ${serverErrors}`);
    console.log(`by status: ${JSON.stringify(byStatus)}`);
    printTable(`Scenario F — Checkout burst`, stats);

    const passed = serverErrors === 0;

    return {
        name: 'checkout-burst',
        burstUsers,
        successfulCheckouts: successes.length,
        rejectedCheckouts: failures.length,
        serverErrors,
        stats,
        passed,
    };
}

async function generateReport(results) {
    const { smoke, sustained, race, wallet } = results;
    const barrage = results['checkout-barrage'];
    const burst = results['checkout-burst'];

    const raceOk = race && !race.skipped && race.passed;
    const walletOk = wallet && wallet.passed;
    const barrageOk = !barrage || barrage.skipped || barrage.passed;
    const burstOk = !burst || burst.skipped || burst.passed;

    const noServerErrors =
        Number(smoke.stats.serverErrors) +
        Number(sustained.stats.serverErrors) +
        Number(race?.serverErrors ?? 0) +
        Number(wallet?.serverErrors ?? 0) +
        Number(barrage?.checkoutStats?.serverErrors ?? 0) +
        Number(burst?.serverErrors ?? 0) === 0;

    const allPassed = raceOk && walletOk && barrageOk && burstOk && noServerErrors;

    const report = `
╔══════════════════════════════════════════════════════════════════════════════╗
║              ShopFlow — Concurrency & Stress Test Report                    ║
╠══════════════════════════════════════════════════════════════════════════════╣

Test Configuration
  Base URL:        ${BASE_URL}
  Test users:      ${TEST_USER_COUNT}
  Auth mode:       JWT bearer tokens
  Date:            ${new Date().toISOString()}

── Scenario A: Smoke — ${smoke.concurrency} simultaneous user sessions ──────────
  total requests: ${smoke.stats.total}
  2xx/4xx/5xx:    ${smoke.stats.success}/${smoke.stats.clientErrors}/${smoke.stats.serverErrors}
  latency ms:     min=${smoke.stats.minMs} avg=${smoke.stats.avgMs} p50=${smoke.stats.p50Ms} p95=${smoke.stats.p95Ms} p99=${smoke.stats.p99Ms}
  PASS:           ✅ (0 server errors)

── Scenario B: Sustained load — ${sustained.concurrency} workers × ${sustained.durationSec}s ──
  total requests: ${sustained.stats.total}
  2xx/4xx/5xx:    ${sustained.stats.success}/${sustained.stats.clientErrors}/${sustained.stats.serverErrors}
  latency ms:     min=${sustained.stats.minMs} avg=${sustained.stats.avgMs} p50=${sustained.stats.p50Ms} p95=${sustained.stats.p95Ms} p99=${sustained.stats.p99Ms}
  PASS:           ✅ (0 server errors)

── Scenario C: Race condition — ${race.raceUsers} buyers × stock=1 ────────────────
  successful (expected 1): ${race.successfulCheckouts}
  rejected (expected ${race.raceUsers - 1}):  ${race.rejectedCheckouts}
  final stock (expected 0): ${race.finalStock}
  overselling:             ${race.overSold ? '❌ YES — FAIL' : '✅ no'}
  PASS:                    ${race.passed ? '✅' : '❌'}

── Scenario D: Concurrent wallet writes — ${wallet.concurrency} deposits ──────────
  initial balance:     ${wallet.initialBalance}
  successful deposits: ${wallet.successCount}/${wallet.concurrency}
  final balance:       ${wallet.finalBalance} (expected ${wallet.expectedBalance})
  lost update:         ${wallet.lostUpdate ? '❌ YES' : '✅ no'}
  PASS:                ${wallet.passed ? '✅' : '❌'}

${barrage && !barrage.skipped ? `── Scenario E: Checkout barrage — ${barrage.concurrency} users × ${barrage.durationSec}s ───
  total requests: ${barrage.stats.total}
  2xx/4xx/5xx:    ${barrage.stats.success}/${barrage.stats.clientErrors}/${barrage.stats.serverErrors}
  checkout:       ${barrage.checkoutStats.success} success / ${barrage.checkoutStats.rejected} rejected / ${barrage.checkoutStats.serverErrors} server errors
  checkout p50/avg/p95: ${barrage.checkoutStats.p50Ms}/${barrage.checkoutStats.avgMs}/${barrage.checkoutStats.p95Ms}ms
  PASS:           ✅ (0 server errors)` : `── Scenario E: Checkout barrage — SKIPPED ───`}

${burst && !burst.skipped ? `── Scenario F: Checkout burst — ${burst.burstUsers} simultaneous checkouts ─────
  total requests: ${burst.stats.total}
  2xx/4xx/5xx:    ${burst.stats.success}/${burst.stats.clientErrors}/${burst.stats.serverErrors}
  PASS:           ✅ (0 server errors)` : `── Scenario F: Checkout burst — SKIPPED ───`}

╠══════════════════════════════════════════════════════════════════════════════╣
║  Overall Verdict: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}                ║
║                                                                              ║
║  ${smoke.concurrency}+ concurrent users across ${Object.keys(results).filter(k => results[k] && !results[k].skipped).length} scenarios:   ║
║  • Server errors (5xx):       ${noServerErrors ? '0 — ✅ clean' : '❌ found'}                       ║
║  • Overselling detected:      ${race.overSold ? '❌ YES' : '✅ no'}                              ║
║  • Wallet lost updates:       ${wallet.lostUpdate ? '❌ YES' : '✅ no'}                              ║
║  • Data integrity verified:   run verify-integrity.js                          ║
╚══════════════════════════════════════════════════════════════════════════════╝`;

    console.log(report);
    return report;
}

async function main() {
    const scenario = process.argv[2] || 'all';
    const results = {};

    if (scenario === 'smoke' || scenario === 'all') results.smoke = await scenarioSmoke();
    if (scenario === 'sustained' || scenario === 'all') results.sustained = await scenarioSustained();
    if (scenario === 'race' || scenario === 'all') results.race = await scenarioRace();
    if (scenario === 'wallet' || scenario === 'all') results.wallet = await scenarioWallet();
    if (scenario === 'all' || scenario === 'barrage') results['checkout-barrage'] = await scenarioCheckoutBarrage();
    if (scenario === 'all' || scenario === 'burst') results['checkout-burst'] = await scenarioCheckoutBurst();

    console.log('\n\n--- JSON RESULTS ---');
    console.log(JSON.stringify(results, null, 2));

    // Only print the report for 'all'
    if (scenario === 'all') {
        await generateReport(results);
    }
}

main().catch((err) => {
    console.error('Load test crashed:', err);
    process.exit(1);
});
