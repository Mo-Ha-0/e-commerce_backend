import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '60s', target: 50 },
        { duration: '10s', target: 0 },
        { duration: '60s', target: 0 },
    ],
};

export default function () {
    const res = http.get('http://localhost:8080/health/stress');
    check(res, { 'status is 200': (r) => r.status === 200 });
    sleep(0.1);
}
