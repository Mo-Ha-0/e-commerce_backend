import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, TEST_USER, PRODUCTS } from './helpers/config.js';
import { login, authHeaders } from './helpers/auth.js';

const succeeded = new Counter('orders_succeeded');
const rejected = new Counter('orders_rejected_stock');
const errors = new Counter('orders_server_errors');

export const options = {
    vus: 50,
    iterations: 50,
    thresholds: {
        orders_succeeded: ['count==1'],
        orders_server_errors: ['count==0'],
    },
};

export function setup() {
    const res = http.get(`${BASE_URL}/products?limit=100`);
    const products = JSON.parse(res.body).items;
    const product = products.find((p) => p.name === PRODUCTS.raceCondition);

    if (!product) {
        console.error('❌ Race product not found. Run: npm run seed:test');
        return { tokens: [], productId: null };
    }

    console.log(
        `Race product: ${product.name} | stock: ${product.stock} | id: ${product.id}`,
    );

    const tokens = [];

    for (let i = 1; i <= 50; i++) {
        const { email, password } = TEST_USER(i);
        const token = login(email, password);

        if (!token) continue;

        http.del(`${BASE_URL}/cart`, null, { headers: authHeaders(token) });
        http.post(
            `${BASE_URL}/cart/items`,
            JSON.stringify({ productId: product.id, quantity: 1 }),
            { headers: authHeaders(token) },
        );

        tokens.push(token);
    }

    console.log(`✅ Setup done: ${tokens.length} users ready`);
    return { tokens, productId: product.id };
}

export default function (data) {
    if (!data.tokens.length) return;

    const token = data.tokens[__VU - 1];
    if (!token) return;

    const res = http.post(`${BASE_URL}/orders`, null, {
        headers: authHeaders(token),
    });

    check(res, {
        'no server errors': (r) => r.status !== 500,
        'valid response': (r) => r.status === 201 || r.status === 400,
    });

    if (res.status === 201) {
        succeeded.add(1);
        console.log(`✅ VU ${__VU}: order SUCCEEDED`);
    } else if (res.status === 400) {
        rejected.add(1);
    } else {
        errors.add(1);
        console.error(`❌ VU ${__VU}: unexpected status ${res.status}`);
    }
}

export function handleSummary(data) {
    const s = data.metrics['orders_succeeded']?.values?.count ?? 0;
    const r = data.metrics['orders_rejected_stock']?.values?.count ?? 0;
    const e = data.metrics['orders_server_errors']?.values?.count ?? 0;

    return {
        stdout: `
╔══════════════════════════════════════════╗
║         NFR-1: Race Condition Test       ║
╠══════════════════════════════════════════╣
║  Succeeded (201):   ${String(s).padEnd(20)} ║
║  Rejected  (400):   ${String(r).padEnd(20)} ║
║  Server errors(500):${String(e).padEnd(20)} ║
╠══════════════════════════════════════════╣
║  ${s === 1 && e === 0 ? '✅ PASSED — Pessimistic lock working' : '❌ FAILED'}                  ║
╚══════════════════════════════════════════╝
`,
    };
}
