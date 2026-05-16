import http from 'k6/http';
import { BASE_URL } from './config.js';

export function login(email, password) {
    const res = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email, password }),
        { headers: { 'Content-Type': 'application/json' } },
    );

    if (res.status !== 201) {
        console.error(`Login failed for ${email}: ${res.status} ${res.body}`);
        return null;
    }

    return JSON.parse(res.body).accessToken;
}

export function authHeaders(token) {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}
