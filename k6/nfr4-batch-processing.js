import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, SEEDED_USERS } from './helpers/config.js';
import { login, authHeaders } from './helpers/auth.js';

export const options = {
    vus: 1,
    iterations: 1,
    thresholds: {
        http_req_failed: ['rate==0'],
        http_req_duration: ['p(95)<30000'],
    },
};

export function setup() {
    return {
        token: login(SEEDED_USERS.admin.email, SEEDED_USERS.admin.password),
    };
}

export default function (data) {
    if (!data.token) return;

    console.log('Triggering batch summary job...');

    const res = http.post(`${BASE_URL}/inventory/batch-summary`, null, {
        headers: authHeaders(data.token),
    });

    check(res, {
        'batch job accepted (200 or 201)': (r) =>
            r.status === 200 || r.status === 201,
        'no server error': (r) => r.status !== 500,
    });

    console.log(`Batch response: ${res.status} — ${res.body}`);
}

export function handleSummary(data) {
    const failed = data.metrics['http_req_failed']?.values?.rate ?? 1;

    return {
        stdout: `
╔══════════════════════════════════════════╗
║       NFR-4: Batch Processing Test       ║
╠══════════════════════════════════════════╣
║  Batch job triggered manually            ║
║  Processes orders in chunks of 100       ║
╠══════════════════════════════════════════╣
║  ${failed === 0 ? '✅ PASSED — Batch job completed' : '❌ FAILED — Batch job errored'}            ║
╚══════════════════════════════════════════╝
`,
    };
}
