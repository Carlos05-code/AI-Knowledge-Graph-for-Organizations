# API Specification

Interactive spec: [`docs/api/openapi.json`](../api/openapi.json) (exported from the running
Swagger at `/api/v1/docs`).

## 1. Conventions

- **Base path**: `/api/v1` (configurable via `APP_PREFIX`).
- **Versioning**: path-based (`v1`); no breakage guarantee until v2.
- **Auth**: `Authorization: Bearer <JWT>`; `@Public()` routes skip it. Refresh via
  `POST /auth/refresh`.
- **RBAC**: `RolesGuard` enforces `ADMIN`/`USER`/`VIEWER` (`@Roles()`).
- **Response envelope** (all endpoints, via `TransformInterceptor`):
  - Success: `{ "success": true, "data": <payload>, "timestamp": "<ISO>" }`
  - Error: `{ "success": false, "message": "<string>", "errors"?: [...], "timestamp": "<ISO>" }`
- **Pagination**: `page` (1-based), `limit` (default 20, max 100); response
  `meta: { total, page, limit, totalPages, hasNext, hasPrevious }` where applicable.
- **Validation**: global `ValidationPipe` — `whitelist`, `forbidNonWhitelisted`,
  `transform`. 400 on violation.
- **Rate limiting**: global throttler — 100 req / 60 s per IP (proxy-aware
  `ThrottlerBehindProxyGuard`; `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX` configurable); 429 on
  exceed.
- **Error mapping**: `HttpException` → status + message; unknown errors → 500 with
  `"Internal server error"` (stack logged).

## 2. Endpoint catalog (16 controllers)

### Authentication
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | Public | `{ email, password }` → tokens + user |
| POST | `/auth/register` | Public | `{ email, firstName, lastName, password, organizationName? }` → tokens; auto-creates org; role ADMIN |
| POST | `/auth/refresh` | Public | `{ refreshToken }` → new tokens (rotates the stored token) |
| POST | `/auth/logout` | Public | `{ refreshToken }` → revokes the token server-side |
| GET | `/auth/me` | JWT | current profile + organization (legacy alias of `/users/me`) |

### Users
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/users/me` | JWT | current profile + organization |
| PATCH | `/users/me` | JWT | update own `firstName, lastName, title, department` |
| GET | `/users` | JWT, ADMIN | org members; `page, limit(≤100), q?` → `{ data, meta }` |
| PATCH | `/users/:id` | JWT, ADMIN | change `role` or `isActive`; self-demotion/deactivation blocked (400) |

### Invitations
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/invitations` | JWT, ADMIN | `{ email, role?, expiresInDays? }` → PENDING invite + email with accept link |
| GET | `/invitations` | JWT, ADMIN | `page, limit, status?` |
| POST | `/invitations/:id/revoke` | JWT, ADMIN | PENDING → REVOKED |
| POST | `/invitations/:id/resend` | JWT, ADMIN | refreshes token + 7-day expiry, re-sends email; PENDING only (400 otherwise) |
| POST | `/invitations/accept` | Public | `{ token, email, firstName, lastName, password }` → creates user, marks ACCEPTED |

### Documents
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/documents` | JWT, Roles(ADMIN,USER) | create document |
| GET | `/documents` | JWT | `page, limit, status?, source?` |
| GET | `/documents/:id` | JWT | includes author, versions, chunks |
| DELETE | `/documents/:id` | JWT, ADMIN | soft delete |
| POST | `/documents/:id/process` | JWT, ADMIN | chunk + embed + graph |

### Upload
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/upload` | JWT | multipart `file`; 50 MB; MIME allowlist; SHA-256; auto-process fire-and-forget |

### Search
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/search` | JWT | `q` required; `mode=keyword\|semantic\|hybrid`; `type? page? limit?` |
| GET | `/search/suggestions` | JWT | `q` |

### Chat (REST)
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/chat/messages` | JWT | `SendMessageDto` → answer + sources |
| GET | `/chat/conversations` | JWT | list |
| GET | `/chat/conversations/:id` | JWT | conversation + messages |

### Chat (WebSocket `/chat`)
- Handshake: JWT in `auth.token` or `query.token`.
- In: `message:send {content, conversationId?}`, `conversation:list`, `conversation:get`, `conversation:delete`.
- Out: `connected`, `message:user`, `message:token` (stream), `message:done`-equivalent final `{done, sources, content}`, `conversation:*`, `error`.

### Knowledge Graph
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/graph/nodes` | JWT | `type? limit?(50) skip?(0)` |
| GET | `/graph/nodes/:id` | JWT | |
| GET | `/graph/search` | JWT | `q type?` |
| GET | `/graph/subgraph/:id` | JWT | `depth?` (2) via APOC |
| POST | `/graph/query` | JWT, ADMIN | raw Cypher `{ query, params? }` |

### Expertise
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/expertise/search` | JWT | `topic` required, `limit?` |
| GET | `/expertise/summary` | JWT | org-level ranking |

### Knowledge Gaps
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/gaps` | JWT | `page limit severity? category? resolved?` |
| POST | `/gaps/detect` | JWT, ADMIN | runs 5 detectors |
| POST | `/gaps/:id/resolve` | JWT, ADMIN | sets resolvedAt |

### Recommendations
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/recommendations` | JWT | experts/documents/meetings/reusableCode |
| GET | `/recommendations/feed` | JWT | personalized feed |

### Meetings
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/meetings` | JWT | create |
| GET | `/meetings` | JWT | `page limit` |
| GET | `/meetings/:id` | JWT | |
| POST | `/meetings/:id/summarize` | JWT | AI summary |
| DELETE | `/meetings/:id` | JWT | soft delete |

### Notifications
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/notifications` | JWT | `page limit unreadOnly?` |
| GET | `/notifications/unread-count` | JWT | |
| POST | `/notifications/:id/read` | JWT | |
| POST | `/notifications/read-all` | JWT | |
| DELETE | `/notifications/:id` | JWT | |

### Connectors
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/connectors` | JWT, ADMIN | `{ name, type, credentials, config?, syncInterval? }`; `type` enum validated |
| GET | `/connectors` | JWT | org-scoped list + latest run |
| GET | `/connectors/:id` | JWT | detail + last 10 runs |
| PUT | `/connectors/:id` | JWT, ADMIN | name/credentials/config/isEnabled/syncInterval |
| DELETE | `/connectors/:id` | JWT, ADMIN | soft delete |
| POST | `/connectors/:id/test` | JWT, ADMIN | runs adapter `authenticate` (e.g. Slack `auth.test`) |
| POST | `/connectors/:id/sync` | JWT, ADMIN | adapter sync → documents + chunks persisted; run tracked |
| GET | `/connectors/:id/runs` | JWT | last 20 runs |

Adapters registry: `GOOGLE_DRIVE`, `SLACK`, `GITHUB`. Slack sync exports configured
channels (`conversations.history`) and recent files (`files.list` → download), skipping
binary payloads and recording per-item errors on the run.

### Policies
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/policies` | JWT, ADMIN | |
| GET | `/policies` | JWT | `page limit category? active?` |
| GET | `/policies/search` | JWT | `q` |
| GET | `/policies/:id` | JWT | |
| PUT | `/policies/:id` | JWT, ADMIN | |
| DELETE | `/policies/:id` | JWT, ADMIN | soft delete + deactivate |

### Admin
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/dashboard` | JWT, ADMIN | stats |
| GET | `/admin/audit-logs` | JWT, ADMIN | `page limit entity? action?` |
| GET | `/admin/health` | JWT, ADMIN | |
| POST | `/admin/secrets/rotate-jwt` | JWT, ADMIN | rotates JWT signing secret; returns `{ secret, version, rotatedAt }` (plaintext shown once, stored encrypted) |

### Health & Metrics
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | Public | Terminus: database, memory_heap (200 MB), disk (< 98%) |
| GET | `/health/live` | Public | liveness |
| GET | `/health/ready` | Public | readiness |
| GET | `/metrics` | Public | Prometheus (default metrics) |

## 3. Example request/response

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "admin@acme.com", "password": "admin123" }
```

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "user": {
      "id": "...", "email": "admin@acme.com",
      "firstName": "Admin", "lastName": "User",
      "role": "ADMIN", "organizationId": "..."
    }
  },
  "timestamp": "2026-08-02T00:00:00.000Z"
}
```

## 4. Error examples

```json
{ "success": false, "message": "Invalid credentials", "timestamp": "..." }
```

```json
{
  "success": false,
  "message": "Bad Request",
  "errors": [{ "code": "isEmail", "message": "email must be an email", "field": "email" }],
  "timestamp": "..."
}
```

## 5. OpenAPI

`docs/api/openapi.json` is the machine-readable spec (Swagger UI at `/api/v1/docs`).
Regenerate after API changes with:

```bash
cd backend && npm run start:dev   # boot API
# fetch http://localhost:3000/api/v1/docs-json > ../docs/api/openapi.json
```
