# ADR-002: Polyglot persistence — PostgreSQL + Neo4j + Qdrant

- **Status**: Accepted
- **Date**: 2026-07
- **Context**: Knowledge search requires relational integrity (tenancy, audit), graph
  traversal (who-knows-what, related entities) and semantic similarity (embeddings). No
  single engine covers all three well.
- **Decision**:
  - **PostgreSQL** = system of record (users, orgs, documents, chunks, meetings, policies,
    audit, notifications).
  - **Neo4j** = knowledge graph (entity nodes + relationships, subgraph traversal via APOC).
  - **Qdrant** = vector index for semantic search; the `Chunk` table in Postgres is the
    canonical chunk store and Qdrant is derivable (re-indexable).
  - Redis as cache, MinIO as object storage.
- **Consequences**:
  - + Right tool per workload; derivable vector index = DR-friendly.
  - + `GraphEntity`/`GraphRelationship` Postgres mirrors support reporting without Neo4j.
  - - Distributed write paths: documents must be written to 3 stores; failures degrade
    gracefully by design (ADR-004).
  - - Ops surface: 6 data services in compose.
