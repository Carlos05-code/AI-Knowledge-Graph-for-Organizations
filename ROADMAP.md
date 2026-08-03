# Roadmap

Status of the **AI Knowledge Graph for Organizations** platform. Legend: ✅ done ·
🔄 in progress · ⬜ planned.

## Current status

- ✅ Backend API complete (NestJS 11, 16 controllers, ~60 endpoints, WebSocket chat)
- ✅ Databases wired (PostgreSQL 16 + Prisma, Neo4j, Qdrant, Redis cache w/ in-memory fallback)
- ✅ Flutter app shell (login/register, chat, hybrid search, graph explorer, profile, admin, documents, connectors)
- ✅ CI (GitHub Actions: backend lint/test/build/docker, frontend analyze/build/docker)
- ✅ Docker Compose stack (13 services), Kubernetes manifests
- ✅ Tests: 42 unit + 36 e2e, all passing
- ✅ Documentation suite (docs/)

## Milestones

| # | Milestone | Status | Notes |
|---|---|---|---|
| 1 | Repository foundation | ✅ | Monorepo, .github, docs, scripts |
| 2 | Flutter application shell | ✅ | Auth, shell, routing, theme |
| 3 | Backend foundation | ✅ | NestJS modules, global pipe/filters/interceptors |
| 4 | Authentication | ✅ | JWT login/register/refresh/me, RBAC roles |
| 5 | User management | ✅ | Profile edit, org members list + search, role/status management (ADMIN), self-demotion guard; invites pending |
| 6 | Connector framework | ✅ | Registry + adapters (Slack real: auth.test, files.list/download, channel export; GitHub adapter stubs); CRUD/test/sync UI + run history |
| 7 | Document ingestion pipeline | ✅ | Upload → checksum → chunk (512/64) → Qdrant; docs UI (list/upload/detail/process/delete); OCR & versions partial |
| 8 | OCR pipeline | ⬜ | Tesseract integration for scanned PDFs/images |
| 9 | Embedding service | ✅ | OpenAI `text-embedding-3-small` + deterministic fallback |
| 10 | Vector database integration | ✅ | Qdrant, cosine, collection `knowledge_chunks` |
| 11 | Knowledge Graph service | ✅ | Neo4j CRUD, subgraph via APOC, graph explorer UI |
| 12 | Search engine | ✅ | Keyword (Postgres ILIKE) + semantic + graph hybrid |
| 13 | Hybrid retrieval | ✅ | Reranked fusion across 3 sources |
| 14 | AI chat | ✅ | REST + WebSocket streaming (OpenAI), RAG context |
| 15 | Citations | 🔄 | `sources` in chat responses; UI rendering pending |
| 16 | Meeting intelligence | 🔄 | CRUD + summarize endpoint; transcript/AI summary UI pending |
| 17 | Expertise discovery | ✅ | Expertise scores, topic search, org summary |
| 18 | Policy search | 🔄 | CRUD + search; content-policy linking partial |
| 19 | Notifications | ✅ | In-app notifications via domain events |
| 20 | Admin dashboard | 🔄 | Metrics + audit logs API; dashboard UI pending |
| 21 | Monitoring | ✅ | Prometheus `/api/v1/metrics`, winston, health checks |
| 22 | Performance optimization | ⬜ | Pagination done; query tuning, caching strategy |
| 23 | Security hardening | 🔄 | Helmet, bcrypt, validation, global rate limiting, graph auth, Swagger prod gate — see SECURITY_SPEC remaining items |
| 24 | Testing | 🔄 | 42 unit + 36 e2e; widget/load/security suites pending |
| 25 | Production deployment | ⬜ | K8s manifests drafted; observability stack pending |

## Known gaps tracked for next releases

- Keycloak referenced in schema/env but not integrated — `keycloakId` is populated with a random UUID; JWT local auth is the active path.
- Android release manifest lacks the `INTERNET` permission (only debug/profile have it).
- Frontend: 2 of 13 routes are "Coming soon" placeholders (meetings, policies); typed models (freezed) planned.
- Frontend `widget_test.dart` needs a `ProviderScope` wrapper to be runnable.
- Dead dependencies in `frontend/pubspec.yaml` (retrofit, freezed, graphview, fl_chart, ...) — either adopt or prune.
- Backend `npm run lint` fails on legacy `no-unsafe-*` violations (type-checked config; fix on install) — resolved deps missing previously.

## Quarter ahead (priority order)

1. Meetings + Policies frontend (transcript/summary/actions; policy linking).
2. Widget test suite with Riverpod harness; fix `widget_test.dart`.
3. Org invites for user management (email invite + accept flow).
4. Release hardening: JWT rotation, Android INTERNET permission, secrets management, `npm audit` CI gate.
