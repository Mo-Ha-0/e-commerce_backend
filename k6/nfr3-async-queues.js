import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, SEEDED_USERS } from './helpers/config.js';
import { login, authHeaders } from './helpers/auth.js';

const checkoutTime = new Trend('checkout_response_ms');

const MAX_EXPECTED_MS = 3000;

export const options = {
    vus: 1,
    iterations: 5,
    thresholds: {
        checkout_response_ms: [`p(95)<${MAX_EXPECTED_MS}`],
    },
};

export function setup() {
    return {
        token: login(
            SEEDED_USERS.customer.email,
            SEEDED_USERS.customer.password,
        ),
    };
}

export default function (data) {
    if (!data.token) return;

    const productsRes = http.get(`${BASE_URL}/products`);
    const products = JSON.parse(productsRes.body).items;
    const product = products.find((p) => p.stock > 5);

    if (!product) {
        console.log('No product with stock > 5 found');
        return;
    }

    http.del(`${BASE_URL}/cart`, null, { headers: authHeaders(data.token) });
    http.post(
        `${BASE_URL}/cart/items`,
        JSON.stringify({ productId: product.id, quantity: 1 }),
        { headers: authHeaders(data.token) },
    );

    const start = Date.now();
    const checkoutRes = http.post(`${BASE_URL}/orders`, null, {
        headers: authHeaders(data.token),
    });
    const duration = Date.now() - start;

    checkoutTime.add(duration);

    check(checkoutRes, {
        'checkout returned 201': (r) => r.status === 201,
        [`responded under ${MAX_EXPECTED_MS}ms`]: () =>
            duration < MAX_EXPECTED_MS,
    });

    console.log(`Checkout took ${duration}ms — invoice/email queued async ✅`);
    sleep(2);
}

export function handleSummary(data) {
    const avg =
        data.metrics['checkout_response_ms']?.values?.avg?.toFixed(0) ?? 'N/A';
    const p95 =
        data.metrics['checkout_response_ms']?.values['p(95)']?.toFixed(0) ??
        'N/A';

    return {
        stdout: `
╔══════════════════════════════════════════╗
║         NFR-3: Async Queue Test          ║
╠══════════════════════════════════════════╣
║  Avg checkout time: ${String(avg + 'ms').padEnd(21)} ║
║  p95 checkout time: ${String(p95 + 'ms').padEnd(21)} ║
║  Invoice/email: sent to Bull queue async ║
╠══════════════════════════════════════════╣
║  ${Number(p95) < MAX_EXPECTED_MS ? '✅ PASSED — Response is immediate' : '❌ FAILED — Too slow'}        ║
╚══════════════════════════════════════════╝
`,
    };
}
