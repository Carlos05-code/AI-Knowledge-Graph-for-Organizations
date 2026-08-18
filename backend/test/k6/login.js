import http from 'k6/http';
import { check, sleep } from 'k6';

// Login throughput / latency: ramp to 100 VU.
//
// Usage:
//   k6 run test/k6/login.js
//   BASE_URL=https://staging.example.com/api/v1 LOAD_USER=load@test.com LOAD_PASSWORD=secret k6 run test/k6/login.js

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const EMAIL = __ENV.LOAD_USER || 'load@test.com';
const PASSWORD = __ENV.LOAD_PASSWORD || 'password123';

export default function () {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, {
    'login returns 200': (r) => r.status === 200,
    'response has access token': (r) => {
      try {
        return r.json().data?.accessToken !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}