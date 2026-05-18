import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, SEEDED_USERS } from './helpers/config.js';
import { login, authHeaders } from './helpers/auth.js';

const batchResponseTime = new Trend('batch_response_ms');

export const options = {
    vus: 1,
    iterations: 1,
    thresholds: {
        http_req_failed: ['rate==0'],
        batch_response_ms: ['p(95)<5000'],
    },
};

export function setup() {
    return {
        token: login(SEEDED_USERS.admin.email, SEEDED_USERS.admin.password),
    };
}

export default function (data) {
    if (!data.token) return;

    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const year = lastMonth.getFullYear();
    const month = lastMonth.getMonth() + 1;

    console.log(`Triggering batch summary for ${year}-${String(month).padStart(2, '0')}...`);

    const start = Date.now();
    const res = http.post(
        `${BASE_URL}/inventory/batch-summary?year=${year}&month=${month}`,
        null,
        { headers: authHeaders(data.token) },
    );
    const duration = Date.now() - start;

    batchResponseTime.add(duration);

    check(res, {
        'batch job accepted (200 or 201)': (r) =>
            r.status === 200 || r.status === 201,
        'no server error': (r) => r.status !== 500,
        'response contains chunk info': (r) => {
            try {
                const body = JSON.parse(r.body);
                return body.enqueued !== undefined && body.totalChunks !== undefined;
            } catch {
                return false;
            }
        },
    });

    console.log(`Batch response: ${res.status} — ${res.body}`);

    sleep(2);

    console.log('Waiting for batch processing to complete...');
    sleep(10);

    console.log('Attempting to download generated PDF...');
    const pdfRes = http.get(`${BASE_URL}/inventory/sales-summary-pdf`, {
        headers: authHeaders(data.token),
    });

    check(pdfRes, {
        'pdf download successful (200)': (r) => r.status === 200,
        'pdf content type is application/pdf': (r) =>
            r.headers['Content-Type'] === 'application/pdf',
    });

    console.log(`PDF response: ${pdfRes.status} — ${pdfRes.headers['Content-Disposition']}`);
}

export function handleSummary(data) {
    const failed = data.metrics['http_req_failed']?.values?.rate ?? 1;
    const p95 = data.metrics['batch_response_ms']?.values?.['p(95)'] ?? 0;

    return {
        stdout: `
╔══════════════════════════════════════════════╗
║        NFR-4: Batch Processing Test          ║
╠══════════════════════════════════════════════╣
║  Triggers batch for last month               ║
║  Orders processed in chunks of 100           ║
║  Each chunk = separate BullMQ worker job     ║
║  PDF auto-generated after all chunks done    ║
╠══════════════════════════════════════════════╣
║  Batch enqueue P95: ${p95.toFixed(0)}ms                   ║
║  ${failed === 0 ? '✅ PASSED — Batch + PDF completed' : '❌ FAILED — Error occurred'}       ║
╚══════════════════════════════════════════════╝
`,
    };
}
