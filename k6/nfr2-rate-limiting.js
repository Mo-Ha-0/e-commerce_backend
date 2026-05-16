import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, SEEDED_USERS } from './helpers/config.js';

const allowed = new Counter('rate_limit_allowed');
const blocked = new Counter('rate_limit_blocked');

export const options = {
    vus: 1,
    iterations: 1,
    thresholds: {
        rate_limit_blocked: ['count>0'],
        rate_limit_allowed: ['count>=5'],
    },
};

export default function () {
    console.log('Sending 10 rapid login requests from same IP...\n');

    for (let i = 1; i <= 10; i++) {
        const res = http.post(
            `${BASE_URL}/auth/login`,
            JSON.stringify({
                email: SEEDED_USERS.customer.email,
                password: SEEDED_USERS.customer.password,
            }),
            { headers: { 'Content-Type': 'application/json' } },
        );

        const isAllowed = res.status === 200 || res.status === 401;
        const isBlocked = res.status === 429;

        if (isAllowed) allowed.add(1);
        if (isBlocked) blocked.add(1);

        check(res, {
            'not a server error': (r) => r.status !== 500,
        });

        console.log(
            `Request ${i}: status=${res.status} ${isBlocked ? '🚫 RATE LIMITED' : '✅'}`,
        );

        sleep(0.1);
    }
}

export function handleSummary(data) {
    const a = data.metrics['rate_limit_allowed']?.values?.count ?? 0;
    const b = data.metrics['rate_limit_blocked']?.values?.count ?? 0;

    return {
        stdout: `
╔══════════════════════════════════════════╗
║         NFR-2: Rate Limiting Test        ║
╠══════════════════════════════════════════╣
║  Allowed requests: ${String(a).padEnd(22)} ║
║  Blocked requests: ${String(b).padEnd(22)} ║
╠══════════════════════════════════════════╣
║  ${b > 0 ? '✅ PASSED — Rate limit is active' : '❌ FAILED — No requests blocked'}       ║
╚══════════════════════════════════════════╝
`,
    };
}
