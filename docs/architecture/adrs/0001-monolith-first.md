# ADR-001: Monolith-first architecture

- **Status**: Accepted
- **Date**: 2026-07
- **Context**: The platform spans auth, ingestion, retrieval, chat, graph, insights. A
  microservice split would add network hops, schema ownership friction and ops burden
  without proven scale needs.
- **Decision**: Ship a single NestJS application with strict module boundaries, a global
  event bus and a RabbitMQ client seam. Microservice readiness is preserved via
  `EventBusService` + `ClientsModule`, so bounded contexts can be extracted per-module
  when load demands.
- **Consequences**:
  - + Simple local dev, single deployable, shared transactional boundaries.
  - + Event handlers (`AuditLogHandler`, `NotificationHandler`) are already decoupled.
  - - All modules share one process/memory; heavy pipeline work must stay async.
  - - Migration cost later is real but contained to proven modules.
