# k6 load tests

Roadmap #24 performance/load suites. These run **against a deployed or staging
environment** (they need seeded users, and `chat.js` needs `OPENAI_API_KEY`), so
they are not part of the default CI pipeline.

## Install

- k6 CLI: https://grafana.com/docs/k6/latest/set-up/install-k6/
  (`choco install k6`, `scoop install k6`, or `docker run grafana/k6 run ...`)

## Run

```sh
# defaults target http://localhost:3000/api/v1 and load@test.com / password123
npm run test:load:login
npm run test:load:search
npm run test:load:chat
npm run test:load:soak

# staging
BASE_URL=https://staging.example.com/api/v1 WS_URL=wss://staging.example.com \
LOAD_USER=load@test.com LOAD_PASSWORD=secret npm run test:load:search
```

## Scenarios & targets

| Script | Scenario | Target |
|---|---|---|
| `login.js` | 100 VU ramp, login with real credentials | P95 < 500 ms, error rate < 1% |
| `search.js` | 60 VU ramp, `GET /search?q=knowledge&mode=hybrid` | P95 < 300 ms, error rate < 1% |
| `chat.js` | 20 concurrent WS sessions, 3 messages each | connect P95 < 1 s, session P95 < 15 s |
| `soak.js` | 32 min ramp + hold (20 VU): 30% login / 70% search + WS chat smoke | HTTP P95 < 1 s, P99 < 2.5 s, error rate < 1% |

## Notes

- `search.js`/`chat.js` authenticate once in `setup()` and reuse the token.
- Rate limiter: the global throttler may 429 long-running ramps — adjust
  `THROTTLE_TTL`/`THROTTLE_LIMIT` or use whitelisted load-test IPs.
- Future: upload-pipeline soak (100 files) and 20k-chunk vector refresh test —
  run separately against a seeded corpus, not in CI.