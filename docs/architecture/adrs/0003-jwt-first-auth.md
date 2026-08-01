# ADR-003: JWT-first auth with Keycloak-ready schema

- **Status**: Accepted (Keycloak integration deferred)
- **Date**: 2026-07
- **Context**: The stack list includes Keycloak for SSO/OAuth2. Full IdP federation adds
  deployment weight (a 14th service) and local-dev friction. The product needs working
  auth today for a demoable, testable system.
- **Decision**:
  - Implement **local JWT auth** (bcrypt(12) passwords, access 15 m / refresh 7 d,
    `POST /auth/login|register|refresh`, `GET /auth/me`) as the active path.
  - Keep the schema **Keycloak-ready**: `User.keycloakId @unique`, `KEYCLOAK_*` env vars
    documented, OAuth connector adapters (Google Drive) already real.
- **Consequences**:
  - + Zero-infra auth, fully unit/e2e testable, deterministic demo.
  - + Migrating to Keycloak later = populate `keycloakId` + swap `JwtStrategy`.
  - - `keycloakId` is currently a random UUID (placeholder); SSO is a ROADMAP item.
  - - No OAuth2 flows for end users until IdP integration.
