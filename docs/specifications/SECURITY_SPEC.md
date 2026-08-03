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
- **Keycloak**: schema-ready (`keycloakId` unique) and env vars documented, but not
  integrated — local JWT is the active path (ADR-003).

## 2. RBAC

| Role | Capabilities |
|---|---|
| `ADMIN` | documents delete/process, gaps detect/resolve, connectors CRUD+sync, policies CRUD, admin dashboard/audit/health |
| `USER` | documents create/list, search, chat, meetings, notifications |
| `VIEWER` | read-only (enum defined; enforcement pending) |

Enforced via `RolesGuard` + `@Roles()` on endpoints; `JwtStrategy` revalidates user +
`isActive` per request.

## 3. OAuth

Connector OAuth (Google Drive) is implemented at the *adapter* level
(`GoogleDriveAdapter.authenticate/refreshAccessToken`). Platform SSO is out of scope.

## 4. Encryption & secrets

- Passwords: bcrypt cost 12.
- Connector credentials: stored in `Connector.credentials` (VarChar 4000) —
  **plaintext today**; encrypted field `isEncrypted` exists on Document; production
  plan: envelope encryption with `ENCRYPTION_KEY` (see ROADMAP).
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
