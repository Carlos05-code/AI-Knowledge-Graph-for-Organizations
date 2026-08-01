# Documentation

Full documentation suite for the **AI Knowledge Graph for Organizations** platform.

## Specifications

| Document | Contents |
|---|---|
| [PROJECT_SPEC.md](specifications/PROJECT_SPEC.md) | Vision, personas, journeys, requirements, NFRs, metrics, risks |
| [ARCHITECTURE_SPEC.md](specifications/ARCHITECTURE_SPEC.md) | Layers, service boundaries, flows, dependency graph, resilience |
| [DATABASE_SPEC.md](specifications/DATABASE_SPEC.md) | PostgreSQL schema, Neo4j model, Qdrant collections, ER diagrams |
| [AI_ARCHITECTURE.md](specifications/AI_ARCHITECTURE.md) | RAG pipeline, GraphRAG, embeddings, prompts, citations, evaluation |
| [API_SPEC.md](specifications/API_SPEC.md) | Endpoint catalog, envelope, auth, pagination; [openapi.json](api/openapi.json) |
| [FRONTEND_SPEC.md](specifications/FRONTEND_SPEC.md) | Flutter structure, routing, state, API layer |
| [BACKEND_SPEC.md](specifications/BACKEND_SPEC.md) | NestJS modules, DI, guards, events, cache, config |
| [SECURITY_SPEC.md](specifications/SECURITY_SPEC.md) | Auth, RBAC, OWASP status, upload safety, tenancy |
| [DEVOPS_SPEC.md](specifications/DEVOPS_SPEC.md) | Docker, K8s, CI, environments, monitoring, backups |
| [TESTING_SPEC.md](specifications/TESTING_SPEC.md) | Unit/e2e inventory, coverage goals, load/security plans |
| [DESIGN_SYSTEM.md](specifications/DESIGN_SYSTEM.md) | Colors, typography, components, a11y |
| [CODING_STANDARD.md](specifications/CODING_STANDARD.md) | Conventions, architecture rules, commit style, review checklist |

## Architecture decisions

- [ADR-001: Monolith-first architecture](architecture/adrs/0001-monolith-first.md)
- [ADR-002: Polyglot persistence — PostgreSQL + Neo4j + Qdrant](architecture/adrs/0002-polyglot-persistence.md)
- [ADR-003: JWT-first auth with Keycloak-ready schema](architecture/adrs/0003-jwt-first-auth.md)
- [ADR-004: Resilient infrastructure — soft-fail secondary services](architecture/adrs/0004-resilient-infrastructure.md)
- [ADR-005: Deterministic fallback embeddings](architecture/adrs/0005-fallback-embeddings.md)

## Ops & guides

- [Deployment guide](deployment-guide.md)
- [Architecture overview](../../ARCHITECTURE.md)
- [Roadmap](../../ROADMAP.md)

## Diagrams & screenshots

- `diagrams/` — Mermaid sources embedded in specs (architecture, ER, flows).
- `screenshots/` — UI captures (added as milestones land).
