import http from 'k6/http';
import { check, sleep } from 'k6';

// Hybrid search latency: P95 target < 300 ms (roadmap #24).
//
// Usage:
//   k6 run test/k6/search.js
//   BASE_URL=https://staging.example.com/api/v1 LOAD_USER=... LOAD_PASSWORD=... k6 run test/k6/search.js

export const options = {
  stages: [
    { duration: '30s', target: 30 },
    { duration: '1m', target: 60 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<300'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const EMAIL = __ENV.LOAD_USER || 'load@test.com';
const PASSWORD = __ENV.LOAD_PASSWORD || 'password123';

export function setup() {
  const login = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = login.json().data?.accessToken;
  return { token };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/search?q=knowledge&mode=hybrid`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });

  check(res, {
    'search returns 200': (r) => r.status === 200,
  });

  sleep(0.5);
}