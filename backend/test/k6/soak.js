import http from 'k6/http';
import { check, sleep } from 'k6';

// Soak test: long-duration moderate load mixing HTTP workloads (login/search),
// file upload, and a small WebSocket chat smoke, to catch leaks, drift and degradation.
// Usage: k6 run test/k6/soak.js
// Set env: BASE_URL, WS_URL, LOAD_USER, LOAD_PASSWORD, UPLOAD_DIR (optional)

// t: number of files to upload (default 100 via __ENV.UPLOAD_FILES)
const UPLOAD_FILES = Number(__ENV.UPLOAD_FILES || 100);

// Simulated local file paths — in CI these would be real paths or generated.
// For the soak we just POST multipart with file contents; the server accepts
// multipart/form-data with a "file" field.
const FILE_PAYLOAD =
  __ENV.UPLOAD_DIR
    ? http.formData([{ name: 'file', filePath: `${__ENV.UPLOAD_DIR}/sample.txt` }])
    : http.formData([
        {
          name: 'file',
          content: 'x'.repeat(1024 * 10), // 10 KB per file (adjust as needed)
          filename: 'sample.txt',
        },
      ]);

export const options = {
  scenarios: {
    http_soak: {
      executor: 'ramping-vus',
      startVUs: 5,
      stages: [
        { duration: '2m', target: 20 },
        { duration: '28m', target: 20 },
        { duration: '2m', target: 0 },
      ],
      exec: 'httpSoak',
    },
    ws_smoke: {
      executor: 'shared-iterations',
      vus: 3,
      iterations: 30,
      startTime: '5m',
      exec: 'wsSession',
    },
    file_upload: {
      executor: 'shared-iterations',
      vus: 2,
      iterations: UPLOAD_FILES,
      startTime: '10m',
      exec: 'uploadFiles',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000', 'p(99)<2500'],
    ws_connecting_duration: ['p(95)<1000'],
    ws_session_duration: ['p(95)<15000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const EMAIL = __ENV.LOAD_USER || 'load@test.com';
const PASSWORD = __ENV.LOAD_PASSWORD || 'password123';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  const token = res.json('data.accessToken');
  if (!token) {
    throw new Error(`setup login failed (${res.status})`);
  }
  return { token };
}

export function httpSoak(data) {
  // 30% login / 70% search mix.
  if (Math.random() < 0.3) {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: EMAIL, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    check(res, {
      'login returns 200': (r) => r.status === 200,
    });
  } else {
    const res = http.get(
      `${BASE_URL}/search?q=knowledge&mode=hybrid`,
      { headers: { Authorization: `Bearer ${data.token}` } },
    );
    check(res, {
      'search returns 200': (r) => r.status === 200,
    });
  }
  sleep(1 + Math.random());
}

export function uploadFiles(data) {
  const token = data.token;
  const payload = FILE_PAYLOAD;
  if (typeof payload === 'string') {
    // fallback: just post JSON if no multipart available
    const res = http.post(`${BASE_URL}/documents`, JSON.stringify({}), {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(res, { 'upload placeholder: 200': (r) => r.status === 200 });
    return;
  }
  const res = http.post(
    `${BASE_URL}/documents`,
    payload,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    },
  );
  check(res, {
    'upload returns 200': (r) => r.status === 200,
    'upload has id': (r) => r.json('data.id') !== undefined,
  });
  sleep(1 + Math.random());
}

export function wsSession(data) {
  const res = ws.connect(
    `${WS_URL}?token=${data.token}`,
    { tags: { scenario: 'ws_smoke' } },
    (socket) => {
      socket.on('open', () => {
        socket.send(
          JSON.stringify({
            type: 'message:send',
            payload: { content: 'soak ping' },
          }),
        );
      });
      socket.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          if (msg.type === 'message:done' || msg.type === 'error') {
            socket.close();
          }
        } catch {
          // ignore non-JSON frames
        }
      });
      socket.setTimeout(() => socket.close(), 14000);
    },
  );
  check(res, {
    'ws session completes': (r) => r.status === 101,
  });
}