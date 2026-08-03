# Testing Specification

## 1. Strategy (pyramid)

| Level | Tool | Count | Status |
|---|---|---|---|
| Unit (backend) | Jest + ts-jest | 42 | ✅ passing |
| e2e (backend) | Jest + Supertest | 36 | ✅ passing |
| Widget (frontend) | flutter_test | 2 | ⚠️ need ProviderScope fix |
| Performance | k6 | — | ⬜ planned |
| Security | npm audit / OWASP checks | — | ⬜ planned |

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
| `prisma.service.spec.ts` | service construction |

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

Run:

```bash
cd backend
npm run test          # unit
npm run test:e2e      # e2e
npm run test:cov      # coverage
```

## 4. Frontend tests

`test/widget_test.dart` — 9 passing widget tests (all pumped inside a
`ProviderScope`): login renders, login validates empty email, login validates short
password, register renders, admin screen locks non-admin users out (via an
`authProvider` override), chat bubbles render citation chips + source sheet (via a
`chatProvider` override), notifications list + mark-read (service override), and
app-router redirect (unauthenticated → login) / authenticated shell render.
`test/providers_test.dart` — 11 provider unit tests with overridden fake services
(no network): `SearchNotifier` (hybrid merge of documents/people/graph, keyword mode,
empty-query short-circuit, error surfacing), `ChatNotifier` (optimistic user
message + assistant reply with `sources`, `loadConversation`, send-failure error
message), and `NotificationsNotifier` (refresh unread, decrement floor, clear).
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

## 6. Performance & load (planned)

- k6: login (100 VU), hybrid search (P95 < 300 ms), chat streaming throughput.
- Vector index refresh test at 20 k chunks (Qdrant indexing threshold).
- Upload pipeline soak (100 files).

## 7. Security testing (planned)

- `npm audit` + `dart pub outdated` gates in CI.
- OWASP ZAP baseline scan against staging.
- JWT/token edge cases (expired, tampered, wrong org) — extend e2e suite.

## 8. CI integration

GitHub Actions runs: backend lint → unit → e2e → build; frontend analyze → test →
build. See `DEVOPS_SPEC.md` §3.
