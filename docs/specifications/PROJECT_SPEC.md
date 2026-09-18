# Project Specification — AI Knowledge Graph for Organizations

## Vision

Give every organization a living knowledge engine: every document, meeting, connector
source and policy indexed, connected, searchable and answerable — so employees spend less
time hunting for information and more time acting on it.

## Problem statement

Enterprise knowledge lives in silos (file shares, drives, chat, meetings, wikis) and is
largely unsearchable: keyword search misses synonyms and context, nobody knows who knows
what, and critical knowledge evaporates with departing employees. Off-the-shelf search
lacks the *graph* view of how information relates.

## Goals

- **Unified ingestion**: one pipeline for documents (upload or connectors), meetings, policies.
- **Hybrid retrieval**: keyword + semantic (vector) + graph search with reranking.
- **Conversational access**: AI chat grounded in organizational knowledge with citations.
- **Insights**: expertise discovery, knowledge-gap detection, recommendations.
- **Governance**: RBAC, audit logging, org-scoped tenancy.

## Non-goals (current scope)

- Cross-organization sharing / public collaboration.
- Real-time co-editing of documents.
- On-premise hardware support (cloud-native only).

## User personas

| Persona | Needs |
|---|---|
| **Employee** | Find docs & answers fast; chat with the knowledge base; get cited sources |
| **Team lead** | Discover experts; find knowledge gaps; get recommendations |
| **Admin** | Upload/manage docs & connectors, policies, audit logs, metrics |

## Key user journeys

1. **Employee**: sign in → chat "How do we deploy the payment API?" → gets answer + 3 cited sources → opens source document.
2. **Lead**: search "Kubernetes" hybrid → filters by type → sees graph of related entities.
3. **Admin**: uploads PDF → auto-processed (checksum, chunked, embedded) → appears in search → gets notification on completion.
4. **Admin**: connects Google Drive → scheduled sync → documents land in the index.

## Functional requirements (implemented)

- Auth: register (auto-creates org), login, refresh, logout, `GET /auth/me`, JWT + RBAC,
  Keycloak SSO (`POST /auth/sso/keycloak`, RS256/JWKS, auto-provisioning, role mapping).
- Users: profile view/edit (`/users/me`), org members list + search, role/status management (ADMIN) (`/users`, `/users/:id`).
- Documents: create, list (paginated/filtered), get, soft-delete (admin), process.
- Upload: multipart, 50 MB cap, MIME allowlist, SHA-256 checksum.
- Search: `hybrid | keyword | semantic`, suggestions, reranked results.
- Chat: REST `POST /chat/messages`, WebSocket streaming with sources; conversations CRUD.
- Graph: nodes CRUD, search, subgraph (depth), raw Cypher query endpoint.
- Expertise: search experts by topic, org summary.
- Gaps: list/filter, admin detect (5 detectors), admin resolve.
- Recommendations: top experts/docs/meetings/reusable code, personalized feed.
- Meetings: CRUD, participants, summarize.
- Notifications: list, unread count, read/read-all.
- Connectors: CRUD (admin), registry (14 real adapters — see API_SPEC.md), sync + run history.
- Policies: CRUD (admin), search, document links.
- Admin: dashboard stats, audit logs, health.
- Health: full check (db/memory/disk), live, ready. Metrics: Prometheus.

## Non-functional requirements

| NFR | Requirement |
|---|---|
| Performance | P95 < 300 ms for search; hybrid search rerank < 50 ms; uploads process async |
| Availability | API boots with PostgreSQL only; Neo4j/Qdrant/Redis degrade gracefully |
| Security | bcrypt(12), JWT 15 m access / 7 d refresh, RBAC, Helmet, validation whitelist, audit log events |
| Scalability | Stateless API (scale horizontally); state in Postgres/Redis; queue-ready via RabbitMQ |
| Tenancy | All queries scoped by `organizationId` |
| Observability | Structured winston logs, Prometheus metrics, health probes |

## Success metrics

- Time-to-answer reduction (search+chat adoption, % answered with citations).
- % of knowledge sources indexed per org.
- CI green rate; e2e coverage of core journeys.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM hallucination | RAG grounding, confidence field, citations, `AI_CONFIDENCE_LOW` notifications |
| Secrets in connectors | credentials encrypted at rest (AES-256-GCM, `ENCRYPTION_KEY`), env-driven, docs security review |
| Scale of vector index | Qdrant 20 k threshold indexing, pagination everywhere |
| Single-region Postgres | Backups + DR in DEVOPS_SPEC; K8s manifests ready |

## Future roadmap

Audio-to-transcript meeting transcription (summarization of an already-provided transcript
is implemented; recording/transcribing the audio itself is not), automated policy-compliance
checks (distinct from the policy *search* already implemented), multi-region, mobile push.
See [ROADMAP.md](../../ROADMAP.md).
