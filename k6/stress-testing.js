import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '20s', target: 5 },
        { duration: '60s', target: 30 },
        { duration: '60s', target: 50 },
        { duration: '30s', target: 0 },
    ],
    thresholds: {
        http_req_failed: ['rate<0.01'],
        http_req_duration: ['p(95)<2000'],
    },
};

export default function () {
    const res = http.get('http://localhost:8080/health/stress');

    check(res, {
        'status is 200': (r) => r.status === 200,
        'has hostname': (r) => JSON.parse(r.body).hostname !== undefined,
        'responded under 500ms': (r) => r.timings.duration < 500,
    });

    sleep(0.1);
}
