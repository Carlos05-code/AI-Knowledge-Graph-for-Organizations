# Backend Specification

## 1. Stack

- NestJS 11, TypeScript strict, `nest-cli` with path aliases (`@modules`, `@shared`, ...).
- Prisma 6 + PostgreSQL; neo4j-driver; @qdrant/js-client-rest; cache-manager-redis-yet.
- Passport JWT, bcrypt, class-validator/transformer, Helmet, compression, Swagger, Terminus, Prometheus, winston.

## 2. Module layout

```
src/
├── main.ts                  # bootstrap: prefix, helmet, CORS, ValidationPipe, Swagger
├── app.module.ts            # ConfigModule(global), Throttler, Terminus, all modules
├── app.controller.ts        # GET / (unregistered demo controller)
├── modules/                 # feature modules (14)
├── infrastructure/          # global infra modules (11)
├── presentation/            # guards, interceptors, filters, health
├── shared/                  # decorators, constants, interfaces
└── domain/                  # AggregateRoot entities + enums
```

## 3. Dependency injection

- All infrastructure modules are `@Global()`: Database, Neo4j, Vector, Cache, Queue,
  Storage, AI, Events, Logger, Metrics, ConnectorRegistry — one shared instance graph.
- Feature modules import only what they use; services constructor-inject.

## 4. Request pipeline

```
Helmet + Compression
  → ValidationPipe (whitelist, forbidNonWhitelisted, transform)
  → JwtAuthGuard / RolesGuard (per controller) / @Public()
  → Controller → Service
  → TransformInterceptor (success envelope)
  → AllExceptionsFilter (error envelope)
  → LoggingInterceptor (METHOD url ip durationMs)
```

## 5. Guards

| Guard | Behavior |
|---|---|
| `JwtAuthGuard` | `AuthGuard('jwt')`; honors `@Public()`; 401 `Invalid or expired token` |
| `RolesGuard` | reads `@Roles()`; enforces `user.role`; 403 otherwise |
| `ThrottlerBehindProxyGuard` | global (`APP_GUARD`); 100 req / 60 s per IP (proxy-aware, first `X-Forwarded-For` hop); configurable via `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX` |

## 6. Interceptors / filters

- `TransformInterceptor` — `{ success, data, timestamp }`.
- `AllExceptionsFilter` — `{ success: false, message, errors?, timestamp }`; 500 for unknown.
- `LoggingInterceptor` — HTTP access log via winston.

## 7. Events & queues

- `EventBusService` (EventEmitter2) publishes domain events:
  `document.uploaded`, `document.processed`, `document.deleted`, `connector.sync.started/completed`,
  `message.sent`, `policy.updated`, `meeting.created`.
- Handlers: `AuditLogHandler` (writes AuditLog), `NotificationHandler` (creates
  Notification rows for org users / admins).
- `QueueModule` registers RabbitMQ `RABBITMQ_CLIENT` (queue `knowledge-graph-queue`,
  durable) — publishing seam for the outbox pattern.

## 8. Caching

- `CacheModule`: Redis (`cache-manager-redis-yet`, TTL 300 s) with automatic
  **in-memory Keyv fallback** when Redis is down.
- `CacheService` (global, fail-open wrapper over `CACHE_MANAGER`): `get/set/del`
  never throw — a Redis outage degrades to cache misses, never errors.
- Applied hot paths (2026-08-18):
  - `NotificationsService.getUnreadCount` — per-user, TTL 15 s, invalidated on
    create/markAsRead/markAllAsRead/delete (badge polling path).
  - `AdminService.getDashboardStats` — per-org, TTL 60 s (aggregate snapshot).
  - `ExpertiseService.getExpertiseSummary` — per-org, TTL 300 s (recomputed on
    score recalculation cadence).

## 9. Logging

- `LoggerService` (winston): level `LOG_LEVEL` (info), format pretty or JSON
  (`LOG_FORMAT=json`), timestamps + error stacks.
- Nest's default `Logger` used across services; HTTP access via `LoggingInterceptor`.

## 10. Configuration

All via `ConfigService` + `.env` (see `.env.example`): `DATABASE_URL` (required),
`JWT_SECRET`/`JWT_ACCESS_EXPIRY(15m)`/`JWT_REFRESH_EXPIRY(7d)`,
`NEO4J_URI/USER/PASSWORD`, `QDRANT_HOST/PORT/API_KEY`, `REDIS_HOST/PORT/PASSWORD`,
`RABBITMQ_URL`, `MINIO_HOST/ACCESS_KEY/SECRET_KEY/BUCKET`,
`OPENAI_API_KEY/MODEL`, `EMBEDDING_MODEL/DIMENSION`, `APP_PREFIX`, `APP_PORT`,
`CORS_ORIGINS`, `LOG_LEVEL`, `LOG_FORMAT`.
Mail (optional, log-only fallback when unset): `MAIL_ENABLED`,
`SMTP_HOST/PORT/SECURE/USER/PASS`, `MAIL_FROM`, `FRONTEND_URL`.
SMTP hardening: `SMTP_REQUIRE_TLS` (STARTTLS enforcement), `SMTP_REJECT_UNAUTHORIZED`
(cert validation, false for dev self-signed), `SMTP_RETRIES` (transient-failure
retries; total attempts = 1 + retries), `SMTP_RETRY_DELAY_MS` (base backoff,
scaled per attempt). Every send attempt is recorded in the `OutboundEmail`
table (to/subject/mode/delivered/messageId, best-effort — never blocks or fails
the caller).
OCR (optional): `OCR_ENABLED`, `OCR_LANGUAGE` (comma-separated packs → `eng+spa`
style), `OCR_MIN_CONFIDENCE` (0 = off; pages/results below threshold are dropped),
`OCR_MAX_PAGES` (per-document cap for scanned-PDF page OCR). PDFs: `pdf-parse`
extracts embedded text layers first (no OCR needed); scanned PDFs render each
page via `pdf-to-img` and OCR page-by-page. Documents store
`metadata.ocrExtracted/ocrEngine/ocrPages/ocrConfidence`.
Encryption (single current key): `ENCRYPTION_KEY`; rotation: `ENCRYPTION_KEYS`
(comma-separated previous keys, oldest first — only used for decryption).
Rotated JWT secrets live in the `AppSecret` table (encrypted, versioned) rather
than env; the env `JWT_SECRET` remains the boot secret accepted for verification.

## 11. Resilience rules

1. Only PostgreSQL is required at boot (`PrismaService.$connect`).
2. Neo4j/Qdrant/Redis/OpenAI fail soft with warnings (ADR-004).
3. Services catch graph/vector failures and degrade per-feature (documented behavior in
   e2e/unit suites).

## 12. WebSocket gateway

`ChatGateway` (`/chat`, socket.io): JWT handshake → events in/out (see API_SPEC §2),
OpenAI streaming via `message:token`. No shared mutable state across connections.

## 13. Data access

- Repositories are not a separate layer; services use PrismaService directly with
  org-scoped `where` clauses (pragmatic; repository extraction is an open ADR).
- Domain entities exist for modeling (`AggregateRoot`) but persistence is Prisma-first.
