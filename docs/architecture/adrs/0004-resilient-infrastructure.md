# ADR-004: Resilient infrastructure — soft-fail secondary services

- **Status**: Accepted
- **Date**: 2026-08
- **Context**: The API depends on Neo4j, Qdrant, Redis, RabbitMQ, MinIO and OpenAI. In
  local dev and degraded prod, any of them may be down. A hard fail on any dependency
  prevents the whole platform from booting.
- **Decision**: Only **PostgreSQL is a hard dependency** at boot (`PrismaService.$connect`).
  All other services:
  - Neo4j: `onModuleInit` verifies connectivity in try/catch → warns "graph features disabled".
  - Qdrant: `ensureCollection` in try/catch → warns "vector search disabled".
  - Redis: `redisStore()` failure → **in-memory Keyv fallback** in the cache module.
  - RabbitMQ: lazy `ClientRMQ` (no connection at boot).
  - OpenAI: missing key/failure → deterministic hashed fallback embeddings.
  - MinIO: client constructed without connection test.
  Feature services (documents, search, chat, recommendations, expertise, gaps) catch
  graph/vector errors and degrade per-feature.
- **Consequences**:
  - + The API always boots with PostgreSQL only; startup logs state exactly what is degraded.
  - + Honest demo experience; testable failure modes (e2e mocks rely on this).
  - - Silent-ish degradation risk → mitigated by explicit WARN logs at boot and per call.
  - - Feature parity depends on all services being up in production (compose provides them).
