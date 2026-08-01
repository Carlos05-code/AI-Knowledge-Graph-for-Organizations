# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please do **not** open a public issue.

**Contact:** security@ai-knowledge-graph.dev

Provide:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a resolution timeline.

## Security Architecture

### Authentication
- JWT-based authentication with short-lived access tokens (15 min)
- Refresh tokens (7 days) stored securely
- Keycloak for OAuth2/OIDC federation

### Authorization
- RBAC (Role-Based Access Control)
- ABAC (Attribute-Based Access Control) for fine-grained permissions
- Every API endpoint is protected by guards

### Data Protection
- All secrets encrypted at rest using AES-256
- TLS 1.3 for all network communication
- PII data encrypted at database level
- No hardcoded secrets in codebase

### API Security
- Rate limiting (100 req/min per user)
- Input validation on all endpoints
- SQL/NoSQL injection prevention via parameterized queries
- CSRF protection
- XSS sanitization
- Prompt injection mitigation for LLM inputs

### Audit
- All access to sensitive data logged
- All admin actions logged
- Immutable audit trail
- 90-day log retention minimum

## Secure Development
- Dependency scanning in CI/CD
- SAST scanning (ESLint security plugin)
- Secrets scanning (git-secrets)
- Regular dependency updates via Dependabot
- Mandatory code review for all PRs
