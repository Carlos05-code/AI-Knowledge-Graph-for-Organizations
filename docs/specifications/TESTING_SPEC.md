# Testing Specification

## 1. Strategy (pyramid)

| Level | Tool | Count | Status |
|---|---|---|---|
| Unit (backend) | Jest + ts-jest | 117 | ✅ passing |
| e2e (backend) | Jest + Supertest | 80 | ✅ passing |
| Widget (frontend) | flutter_test | 28 (13 widget + 15 provider) | ✅ passing |
| Performance | k6 | 4 scripts (`test/k6/` incl. soak) | ✅ scripts, run against staging |
| Security | `npm audit --audit-level=high` | 0 high+ | ✅ CI gate (`.github/workflows/ci.yml`) |

## 2. Backend unit tests (`src/**/*.spec.ts`)

| Suite | Coverage |
|---|---|
| `auth.controller.spec.ts` | login/register delegation |
| `chat.service.spec.ts` | sendMessage (OpenAI stubbed via property-define mock), conversations |
| `documents.service.spec.ts` | create (persist + graph + event), pagination, process |
| `expertise.service.spec.ts` | experts by topic, summary ranking, Neo4j failure fallback |
| `gaps.service.spec.ts` | pagination, resolve, 5 detectors, stale docs, graceful failure |
| `recommendations.service.spec.ts` | shape, similar-role experts, Qdrant-based recs, personalized feed |
| `users.service.spec.ts` | profile get/update, member pagination + search, role/status updates, self-demotion guard |
| `slack.adapter.spec.ts` | auth.test ok/invalid/missing token, listFiles mapping, syncAll text-download + binary-skip, channel export (all via mocked `fetch`) |
| `encryption.service.spec.ts` | AES-256-GCM round-trip, per-call random IV, wrong-key failure, malformed payload, legacy `tryDecrypt` fallback, versioned `akg:v{N}:` payloads (active version tag, mid-chain + rotated decryption, unknown-future-version rejection, unversioned legacy decrypt) |
| `secrets.service.spec.ts` | env-only secrets, rotated secrets newest-first, signing-secret selection, encrypted-at-rest storage + version increment, DB-unavailable fallback |
| `ocr.service.spec.ts` | OCR mime detection, image OCR + confidence, empty-text null, tesseract-unavailable/recognition-failure fallbacks, PDF text-layer fast path (pdf-parse), scanned-PDF page-by-page OCR, `OCR_MAX_PAGES` cap, `OCR_MIN_CONFIDENCE` page drop, language-pack normalization |
| `email.service.spec.ts` | SMTP delivery + auth + TLS passthrough (`secure/requireTLS/rejectUnauthorized`), log-only fallback without SMTP_HOST, transient-failure retry then success, `SMTP_RETRIES` exhaustion → log fallback, outbound log rows (`OutboundEmail`) for delivered/undelivered attempts, invitation mail accept-link build |
| `roles.guard.spec.ts` | no-user 403, VIEWER read allowed / write blocked (POST/PATCH/DELETE), ADMIN+USER writes allowed, `@Roles` list enforcement (VIEWER not whitelisted) |
| `chat.gateway.spec.ts` | WS connection auth (missing token, unknown-signature rejection, inactive-user rejection, multi-secret verification via `SecretsService`, DB role attach), VIEWER blocked on `message:send`/`conversation:delete`, VIEWER allowed on `conversation:list`, USER write allowed |
| `prisma.service.spec.ts` | service construction |
| `http-metrics.interceptor.spec.ts` | counter + histogram recorded on success, response-status capture, 500 on thrown errors, path fallback when route is undefined |

Patterns: mocked Prisma delegates, `Object.defineProperty` for OpenAI/Qdrant clients,
no network in unit tests.

## 3. Backend e2e tests (`test/*.e2e-spec.ts`)

`api.integration.e2e-spec.ts` boots the real `AppModule` with mocked infrastructure
(Prisma, Neo4j, Qdrant, Embedding, MinIO, terminus indicators, uuid, amqplib,
cache-manager-redis-yet, bcrypt) and asserts:

- health (full check + live)
- auth: register, login, invalid login 401, validation 400s
- documents: create (ADMIN), list + pagination coercion (string→int query), admin-only delete (403/200)
- search: hybrid + suggestions; graph: nodes + raw Cypher (401/403/ADMIN only)
- users: profile (200/401), profile update, members list + role update (RBAC 403/200)
- chat: messages + conversations; connectors: admin-only create, invalid type 400,
  org-scoped list, test-connection RBAC, Slack sync (mocked `fetch` → documents + run)
- notifications, expertise, gaps, recommendations, upload auth, admin dashboard RBAC
- admin secrets: rotate-jwt RBAC (403 for non-admin) + successful rotation (201,
  encrypted-at-rest `akg:v` value, hex secret returned once)
- invitations: create (ADMIN RBAC 403/201), list, revoke, accept; resend
  (RBAC 403, token refresh + email re-send 201, non-pending 400)
- VIEWER role (read-only): GET documents/chat-conversations/meetings/notifications/
  search/expertise/graph allowed; POST documents/chat-messages/upload/meetings/
  notifications-read and PATCH users/me forbidden (403)

Run:

```bash
cd backend
npm run test          # unit
npm run test:e2e      # e2e
npm run test:cov      # coverage
```

## 4. Frontend tests

`test/widget_test.dart` — 10 passing widget tests (all pumped inside a
`ProviderScope`): login renders, login validates empty email, login validates short
password, register renders, admin screen locks non-admin users out (via an
`authProvider` override), admin members tab lists pending invitations + sends an
invite via dialog (service overrides), chat bubbles render citation chips + source
sheet (via a `chatProvider` override), notifications list + mark-read (service
override), and app-router redirect (unauthenticated → login) / authenticated shell
render.
`test/providers_test.dart` — 15 provider unit tests with overridden fake services
(no network): `SearchNotifier` (hybrid merge of documents/people/graph, keyword mode,
empty-query short-circuit, error surfacing), `ChatNotifier` (optimistic user
message + assistant reply with `sources`, `loadConversation`, send-failure error
message), `NotificationsNotifier` (refresh unread, decrement floor, clear), and
`InvitationsNotifier` (load pending invites, invite + list refresh, invite failure
surfaces error, revoke removes).
Suites run via `flutter test`.

Additional planned suites:

- Auth flow (login/register state machine) with mocked `AuthService`.
- Chat provider optimistic-send + error path.
- Search provider mode switching.
- AppShell navigation selection.

## 5. Coverage goals

- Backend unit: ≥ 80% statements for services/controllers (currently ~50–90% per suite).
- e2e: every public endpoint exercised at least once (current: 36 specs covering all 17 controllers).
- Frontend: critical flows (auth, chat, search) ≥ 70%.

## 6. Performance & load

- k6 scripts in `backend/test/k6/` (run against staging, not CI):
  - `login.js` — 100 VU ramp, P95 < 500 ms, error rate < 1%.
  - `search.js` — 60 VU ramp, hybrid search P95 < 300 ms.
  - `chat.js` — 20 concurrent WS sessions, connect P95 < 1 s, session P95 < 15 s.
  - `soak.js` — 32 min soak (ramp → 20 VU hold → ramp down), 30% login / 70% search
    mix plus WS chat smoke, P95 < 1 s / P99 < 2.5 s, error rate < 1%.
  - Run via `npm run test:load:login|search|chat|soak` (see `test/k6/README.md`).
- Vector index refresh test at 20 k chunks (Qdrant indexing threshold) — future.
- Upload pipeline soak (100 files) — future.

## 7. Security testing

- `npm audit` + `dart pub outdated` gates in CI.
- **Done (2026-08-18)** — JWT/token edge cases in `api.integration.e2e-spec.ts`
  ("Auth token edge cases", 6 cases): expired token → 401, tampered signature → 401,
  token for deleted user → 401, token for inactive user → 401, forged role/org
  claims rejected (role taken from DB) → 403, missing Authorization → 401.
- **Done (2026-08-18)** — OWASP ZAP baseline: `backend/test/zap/zap-baseline.sh`
  (Docker, passive scan, fails on HIGH alerts, HTML/JSON/MD/XML reports) + CI job
  `zap-baseline` (weekly Monday 03:00 + `workflow_dispatch`, needs `STAGING_URL`
  secret, uploads report artifact). Unauthenticated scope; authenticated active
  scanning is a follow-up.

## 8. CI integration

GitHub Actions runs: backend lint → unit → e2e → build; frontend analyze → test →
build. See `DEVOPS_SPEC.md` §3.

### Lint policy

`npm run lint` (eslint flat config, type-checked) is an exit-code gate: **0 errors
(legacy warnings tolerated — see ROADMAP)**. Legacy `no-unsafe-*` (assignment,
member-access, call, return) and `no-require-imports` are configured as `warn`
(documented intentional exceptions: optional-dep `require()` calls for
nodemailer, pdf-parse, pdf-to-img, googleapis, jsonwebtoken). New code should not
add warnings where avoidable; `no-unused-vars` uses `^_` ignore patterns.

### E2e health suite

`app.e2e-spec.ts` mocks `MemoryHealthIndicator` (always `up`) so the suite is
independent of the test machine's heap usage under parallel jest workers
(previously flaky 503 on `/api/v1/health`).
