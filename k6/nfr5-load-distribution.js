import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL } from './helpers/config.js';

const hostnameCounter = new Counter('hostname_seen');

export const options = {
    vus: 10,
    duration: '30s',
    thresholds: {
        http_req_failed: ['rate==0'],
        http_req_duration: ['p(95)<500'],
    },
};

export default function () {
    const res = http.get(`${BASE_URL}/health`);

    check(res, { 'status is 200': (r) => r.status === 200 });

    if (res.status === 200) {
        try {
            const body = JSON.parse(res.body);
            const hostname = body.hostname;
            if (hostname) {
                hostnameCounter.add(1, { hostname });
            }
        } catch (e) {
            console.error('Failed to parse response:', e);
        }
    }
}
