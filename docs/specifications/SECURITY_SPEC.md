# Security Specification

## 1. Authentication

- **JWT**: HS256, `sub` = userId, claims `email/orgId/role`. Access token TTL 15 m
  (`JWT_ACCESS_EXPIRY`), refresh 7 d (`JWT_REFRESH_EXPIRY`).
- **Login**: email + password verified with `bcrypt.compare` against bcrypt(12) hash.
- **Register**: auto-creates organization + ADMIN user, returns tokens.
- **Refresh tokens**: opaque random UUIDs stored in `RefreshToken` (per-user,
  `expiresAt`); `POST /auth/refresh` **rotates** — validates the stored token
  (revoked/expiry checks), revokes it, issues a new pair.
- **Logout**: `POST /auth/logout` revokes the presented refresh token server-side
  (best-effort from the client, which always clears local storage).
- **`GET /auth/me`**: returns profile; used by frontend `checkAuth()`.
- **Keycloak SSO** (enabled when `KEYCLOAK_URL` + `KEYCLOAK_REALM` are set):
  - `POST /auth/sso/keycloak` accepts a Keycloak access token; verification is
    **RS256-only**, with 30 s clock skew on `exp`, plus `iss` and `aud`
    (`KEYCLOAK_CLIENT_ID`) checks.
  - Public keys are fetched from the realm JWKS endpoint
    (`${issuer}/protocol/openid-connect/certs`, override `KEYCLOAK_JWKS_URL`),
    5-minute in-memory cache, 5 s HTTP timeout.
  - Sign-in links by `sub` (keycloakId) first, then by email (`user.update` sets
    `keycloakId`); unknown users are provisioned into `KEYCLOAK_DEFAULT_ORG_ID`
    (or a new `sso-{org}` organization) with a null password.
  - Realm roles map `admin→ADMIN`, `user→USER`, `viewer→VIEWER`; no match
    defaults to `USER`. Inactive accounts are rejected with 401.
  - On success a local JWT pair is issued via the normal `issueTokens` path.
  - `GET /auth/sso/keycloak/status` reports enabled/issuer for the frontend.
  - Local email+password auth remains the primary path; SSO is additive (ADR-003).

## 2. RBAC

| Role | Capabilities |
|---|---|
| `ADMIN` | documents delete/process, gaps detect/resolve, connectors CRUD+sync, policies CRUD, admin dashboard/audit/health |
| `USER` | documents create/list, search, chat, meetings, notifications |
| `VIEWER` | strictly read-only — GET/HEAD/OPTIONS only |

`VIEWER` is enforced inside `RolesGuard`: any non-read HTTP method is denied
(`403 VIEWER role is read-only`) regardless of `@Roles()`, so VIEWER cannot
create/upload/chat/meet/write notifications or edit profiles, but reads freely
(documents, search, chat history, meetings, notifications, graph, expertise,
recommendations). `@Roles()`-restricted endpoints (admin) additionally exclude
VIEWER from their read endpoints. Role is taken from the DB (`JwtStrategy`
revalidates per request) — a forged token claim is not trusted.

Enforced via `RolesGuard` + `@Roles()` on endpoints; `JwtStrategy` revalidates user +
`isActive` per request. The WebSocket chat gateway applies the same policy on
connections: tokens are verified against every active JWT secret (env boot secret
+ rotated `AppSecret` rows), the DB user is revalidated (`isActive`, real role),
and `message:send` / `conversation:delete` are denied for VIEWER
(`WsException "VIEWER role is read-only"`); reads (`conversation:list`/`get`)
stay open to VIEWER.

## 3. OAuth

Connector OAuth (Google Drive) is implemented at the *adapter* level
(`GoogleDriveAdapter.authenticate/refreshAccessToken`). Platform SSO is out of scope.

## 4. Encryption & secrets

- Passwords: bcrypt cost 12.
- Connector credentials: **encrypted at rest** with AES-256-GCM (`EncryptionService`,
  `ENCRYPTION_KEY` env — SHA-256-derived key, random 96-bit IV, auth tag in
  `akg:v{version}.iv.tag.ciphertext` payload). Encrypted on create/update, decrypted only inside
  the service layer (`configOf` for adapter connections, `expose` for API
  responses); legacy plaintext rows decrypt via `tryDecrypt` fallback.
- **Key rotation (versioned ciphertext):**
  - Payloads carry a `akg:v{N}:` prefix; version 1 = original key. Ciphertext written
    before versioning (plain `iv.tag.ciphertext`) still decrypts by trying every known
    key (newest first).
  - `ENCRYPTION_KEY` = current key (used for all new encryption).
  - `ENCRYPTION_KEYS` = comma-separated previous keys (oldest first) used only for
    decryption of older versions.
  - Procedure: set `ENCRYPTION_KEYS` to the current key, put the new key in
    `ENCRYPTION_KEY`, restart all instances; old rows decrypt via their version,
    new writes use the new key. Deploy versioned code before rotating (old code
    rejects `akg:v` payloads as malformed).
- **JWT secret rotation (`POST /api/v1/admin/secrets/rotate-jwt`, ADMIN only):**
  - Generates a 32-byte random secret, stores it encrypted at rest in the `AppSecret`
    table (name `JWT_SECRET`, monotonically increasing `version`, `isActive`,
    `createdById`), returns the plaintext exactly once so ops can persist it to
    `JWT_SECRET`/env for future restarts.
  - Dual-key grace rotation: `JwtStrategy` and `AuthService` accept/verify every
    active secret (env boot secret + active `AppSecret` rows), so tokens issued
    before rotation keep validating until they expire or ops deactivates the old
    rows (`isActive = false`). DB unavailability degrades to env-secret-only
    verification rather than failing closed.
- Secrets: env-driven, never committed (`.env` in `.gitignore`); `.env.example`
  documents keys without values.

## 5. Audit logs

Every domain event writes an `AuditLog` row (organizationId, userId, action, entity,
entityId, changes, ipAddress, userAgent, metadata): DOCUMENT_UPLOADED, DOCUMENT_PROCESSED,
DOCUMENT_DELETED, CONNECTOR_SYNC_COMPLETED, POLICY_UPDATED, MEETING_CREATED.
Viewable by admins (`GET /admin/audit-logs`).

## 6. OWASP checklist status

| Control | Status |
|---|---|---|
| Input validation (whitelist + forbidNonWhitelisted) | ✅ |
| SQL injection (Prisma parameterized) | ✅ |
| XSS (Helmet, JSON API, Flutter rendering) | ✅ |
| CSRF (bearer tokens, CORS allowlist) | ✅ |
| Rate limiting | ✅ global `ThrottlerBehindProxyGuard` (100 req / 60 s, proxy-aware; `RATE_LIMIT_TTL`/`RATE_LIMIT_MAX` configurable) |
| Security headers (Helmet) | ✅ |
| Upload validation (size 50 MB, MIME allowlist, ParseFilePipe) | ✅ |
| Auth on all endpoints | ✅ graph endpoints now JWT-protected; raw Cypher admin-only; only Health + metrics public (probes) |
| Swagger disabled in prod | ✅ gated by `NODE_ENV=production` |
| Secrets in code | ✅ none committed (verified at first commit) |
| Dependency audit | ✅ `npm audit --audit-level=high` gate in CI (0 high+; js-yaml pinned via npm `overrides`) |

## 7. Prompt injection defense

- System prompt instructs model to answer only from retrieved context and decline
  out-of-context/instructional content.
- Retrieved chunks are scoped to the caller's `organizationId` before reaching the model.
- Follow-up: instruction-filter classifier, context sanitization (ROADMAP).

## 8. Data privacy & tenancy

- All queries filter `organizationId` (docs, meetings, policies, connectors, search
  filters on vector payload).
- Mutating single-record endpoints enforce scope server-side: `meetings.delete`,
  `policies.delete` verify `{ id, organizationId }` (404 otherwise);
  `notifications.markAsRead`/`delete` verify `{ id, userId }` (404 otherwise);
  chat `deleteConversation` verifies `{ id, userId }`.
- Chat sources restricted to org content; expertise scores scoped per org.
- Notification recipients limited to org members / org admins.

## 9. File upload security

- Multipart only; `FileInterceptor` with `diskStorage` to `./uploads`, UUID filenames.
- 50 MB cap (`MaxFileSizeValidator`) + `FileTypeValidator` MIME allowlist:
  pdf, docx, pptx, xlsx, md, txt, html, png, jpeg, tiff.
- SHA-256 checksum stored for integrity/dedup.

## 10. Ops security

- Health endpoints public (intended for probes); `/metrics` public (Prometheus).
- CORS default `*` — production should pin `CORS_ORIGINS`.
- Logging excludes secrets (passwords/tokens never logged).
