import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';

// Chat streaming throughput: 20 concurrent sessions, each sends one message
// and waits for a response event (message:user / message:chunk / message:done).
// Requires the target env to have OPENAI_API_KEY configured.
//
// Usage:
//   k6 run test/k6/chat.js
//   BASE_URL=https://staging.example.com/api/v1 WS_URL=wss://staging.example.com LOAD_USER=... LOAD_PASSWORD=... k6 run test/k6/chat.js

export const options = {
  scenarios: {
    chat: {
      executor: 'per-vu-iterations',
      vus: 20,
      iterations: 3,
    },
  },
  thresholds: {
    ws_connecting_duration: ['p(95)<1000'],
    ws_session_duration: ['p(95)<15000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
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
  const res = ws.connect(`${WS_URL}?token=${data.token}`, {}, (socket) => {
    let responded = false;

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'message:send',
          payload: { content: 'Load test message — summarize the knowledge base' },
        }),
      );
    });

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (
          msg.type === 'message:user' ||
          msg.type === 'message:chunk' ||
          msg.type === 'message:done' ||
          msg.type === 'error'
        ) {
          responded = true;
          if (msg.type === 'message:done' || msg.type === 'error') {
            socket.close();
          }
        }
      } catch {
        // ignore non-JSON frames
      }
    });

    socket.setTimeout(() => {
      socket.close();
    }, 14000);
  });

  check(res, {
    'chat session connected': (r) => r.status === 101,
  });
}