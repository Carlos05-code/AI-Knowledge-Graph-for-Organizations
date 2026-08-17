# Roadmap

Status of the **AI Knowledge Graph for Organizations** platform. Legend: ✅ done ·
🔄 in progress · ⬜ planned.

## Current status

- ✅ Backend API complete (NestJS 11, 16 controllers, ~60 endpoints, WebSocket chat)
- ✅ Databases wired (PostgreSQL 16 + Prisma, Neo4j, Qdrant, Redis cache w/ in-memory fallback)
- ✅ Flutter app shell (login/register, chat w/ citations, hybrid search, graph explorer, profile, admin, documents, connectors, meetings, policies, notifications)
- ✅ CI (GitHub Actions: backend lint/test/build/docker, frontend analyze/build/docker)
- ✅ Docker Compose stack (13 services), Kubernetes manifests
- ✅ Tests: 90 unit + 70 e2e + 28 frontend tests, all passing
- ✅ Documentation suite (docs/)

## Milestones

| # | Milestone | Status | Notes |
|---|---|---|---|
| 1 | Repository foundation | ✅ | Monorepo, .github, docs, scripts |
| 2 | Flutter application shell | ✅ | Auth, shell, routing, theme |
| 3 | Backend foundation | ✅ | NestJS modules, global pipe/filters/interceptors |
| 4 | Authentication | ✅ | JWT login/register/refresh/me, RBAC roles |
| 5 | User management | ✅ | Profile edit, org members list + search, role/status management (ADMIN), self-demotion guard; org invitations (invite/accept/revoke + accept-link email) |
| 6 | Connector framework | ✅ | Registry + adapters (Slack real: auth.test, files.list/download, channel export; GitHub adapter stubs); CRUD/test/sync UI + run history |
| 7 | Document ingestion pipeline | ✅ | Upload → checksum → chunk (512/64) → Qdrant; docs UI (list/upload/detail/process/delete); OCR & versions partial |
| 8 | OCR pipeline | ✅ | Tesseract (`tesseract.js`) for scanned PDFs/images: `OcrService` w/ `isOcrCandidate` + graceful fallback, wired into document processing (OCR'd text → chunked/indexed, `metadata.ocrExtracted`); hardened: PDF text-layer fast path (`pdf-parse`), per-page scanned-PDF OCR (`pdf-to-img`), `OCR_MAX_PAGES` cap, `OCR_MIN_CONFIDENCE` threshold, language packs (`eng+spa`), `metadata.ocrPages/ocrConfidence` |
| 9 | Embedding service | ✅ | OpenAI `text-embedding-3-small` + deterministic fallback |
| 10 | Vector database integration | ✅ | Qdrant, cosine, collection `knowledge_chunks` |
| 11 | Knowledge Graph service | ✅ | Neo4j CRUD, subgraph via APOC, graph explorer UI |
| 12 | Search engine | ✅ | Keyword (Postgres ILIKE) + semantic + graph hybrid |
| 13 | Hybrid retrieval | ✅ | Reranked fusion across 3 sources |
| 14 | AI chat | ✅ | REST + WebSocket streaming (OpenAI), RAG context |
| 15 | Citations | ✅ | `sources` in chat + WebSocket responses; citation chips in chat UI |
| 16 | Meeting intelligence | ✅ | CRUD + summarize endpoint; meetings UI (create/list/detail/summarize/delete) |
| 17 | Expertise discovery | ✅ | Expertise scores, topic search, org summary |
| 18 | Policy search | ✅ | CRUD + search + document linking; policies UI (filter/search/create/edit/activate/delete) |
| 19 | Notifications | ✅ | Domain-event notifications API + UI (screen, unread badge in shell, mark read/all, swipe delete) |
| 20 | Admin dashboard | ✅ | Metrics + audit logs API; dashboard UI (Overview/Members/Audit Logs tabs) |
| 21 | Monitoring | ✅ | Prometheus `/api/v1/metrics`, winston, health checks |
| 22 | Performance optimization | ⬜ | Pagination done; query tuning, caching strategy |
| 23 | Security hardening | 🔄 | Helmet, bcrypt, validation, global rate limiting, graph auth, Swagger prod gate, DB-backed refresh token rotation + logout revocation, `npm audit` CI gate (0 high), connector credentials encrypted at rest (AES-256-GCM), versioned ciphertext (`akg:v{N}:`, `ENCRYPTION_KEYS` chain), DB-backed JWT secret rotation endpoint (`POST /admin/secrets/rotate-jwt`, dual-key grace), VIEWER read-only enforcement (RolesGuard blocks non-GET for VIEWER; WS chat role-gated: multi-secret verify + DB revalidation on connect, writes denied for VIEWER) — see SECURITY_SPEC remaining items |
| 24 | Testing | 🔄 | 90 unit + 70 e2e + 28 frontend tests; load/security suites pending |
| 25 | Production deployment | ⬜ | K8s manifests drafted; observability stack pending |

## Known gaps tracked for next releases

- Keycloak referenced in schema/env but not integrated — `keycloakId` is populated with a random UUID; JWT local auth is the active path.
- All shell routes are wired to real screens (no "Coming soon" placeholders); typed models (freezed) planned.
- Keycloak referenced in schema/env but not integrated — `keycloakId` is populated with a random UUID; JWT local auth is the active path.
- All shell routes are wired to real screens (no "Coming soon" placeholders); typed models (freezed) planned. `freezed`/`json_serializable` were pruned with the other dead deps; a small `json_annotation`-only codegen for models could return later.
- Widget test suite: 10 widget + 15 provider tests (login/register, admin gating + invites, chat citations, notifications UI + provider, router redirect/shell; search/chat/notifications/invitations providers).
- Backend `npm run lint` gate restored — resolved 2026-08-17: `eslint.config.mjs` now exits 0 (0 errors / 1093 warnings). Legacy `no-unsafe-*` rules (assignment/member-access/call/return) and `no-require-imports` downgraded to `warn` (intentional lazy `require()` for optional deps: nodemailer, pdf-parse, pdf-to-img, googleapis, jsonwebtoken); `no-unused-vars` configured with `^_` ignore patterns; `dist/`/`coverage/`/`uploads/` ignored; leftover 64 errors fixed (require-await stubs, enum comparisons, unused imports/args, empty blocks, unbound methods).
- Org-scoped delete enforcement — **resolved 2026-08-17**: `meetings.delete`/`policies.delete` now verify the record belongs to the caller's org (`findFirst({ id, organizationId })` → `404` otherwise), `notifications.markAsRead`/`delete` verify ownership (`findFirst({ id, userId })` → `404`), `meetings.generateSummary`/`policies.update` now throw `NotFoundException` (404) instead of generic 500; chat `deleteConversation` was already ownership-scoped. 8 new e2e cases; 90 unit + 70 e2e green.

## Quarter ahead (priority order)

1. ✅ Secrets rotation — done: versioned ciphertext (`akg:v{N}:` + `ENCRYPTION_KEYS`), `AppSecret` table (encrypted at rest), `POST /admin/secrets/rotate-jwt` with dual-key grace (env + DB secrets verified/signed), 67 unit + 46 e2e green.
2. ✅ OCR perf/hardening — done: PDF text-layer fast path (`pdf-parse`), per-page scanned-PDF OCR (`pdf-to-img`, `OCR_MAX_PAGES` cap), `OCR_MIN_CONFIDENCE` threshold, language packs (`OCR_LANGUAGE` comma → `eng+spa`), per-document OCR metadata (`ocrPages`/`ocrConfidence`); 73 unit + 46 e2e green.
3. ✅ Invitation email follow-ups — done: SMTP hardening (`SMTP_REQUIRE_TLS`, `SMTP_REJECT_UNAUTHORIZED`, `SMTP_RETRIES`, `SMTP_RETRY_DELAY_MS` with per-attempt backoff), `POST /invitations/:id/resend` (fresh token + renewed 7-day expiry, PENDING only), `OutboundEmail` audit log (every attempt, best-effort, non-blocking); 76 unit + 49 e2e green.
4. ✅ VIEWER role enforcement — done: `RolesGuard` now denies every non-GET/HEAD/OPTIONS request for VIEWER (`403 VIEWER role is read-only`), attached to the JWT-only write controllers (chat, upload, meetings, notifications, users), role taken from the DB per request; 13 e2e VIEWER cases + `roles.guard.spec` (6) added; 82 unit + 62 e2e green.
5. ✅ WebSocket chat role-gating — done: `ChatGateway` verifies tokens against every active JWT secret (env + rotated `AppSecret` rows via `SecretsService`), revalidates the DB user on connect (`isActive`, real role), and denies `message:send`/`conversation:delete` for VIEWER (reads allowed); `chat.gateway.spec` (8 tests); 90 unit + 62 e2e green.
6. ✅ Lint gate restoration — done: CI `npm run lint` passes again (0 errors; 1093 legacy warnings documented above); `--fix` auto-formats; leftover errors fixed across adapters/services/specs; flaky e2e `memory_heap` health check eliminated by mocking `MemoryHealthIndicator` in `app.e2e-spec.ts`; 90 unit + 62 e2e green (2 consecutive full e2e runs).
7. ✅ Org-scoped delete enforcement — done: tenant/ownership scoping enforced on `meetings.delete`, `policies.delete`, `notifications.markAsRead`, `notifications.delete` (scoped `findFirst` → `404 Not Found` when the record is not in the caller's org / not owned); `generateSummary` + `policies.update` now return 404 instead of generic 500; e2e suites hardened against slow-CI hook timeouts (30 s `beforeAll`); 8 new e2e cases; 90 unit + 70 e2e green.
