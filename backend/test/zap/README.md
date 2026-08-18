# OWASP ZAP baseline

Roadmap #24 security suite. An automated **baseline** (passive) scan of the
publicly reachable API surface using the official ZAP Docker image. It finds
missing security headers, information disclosure, TLS issues and other
passive-detectable weaknesses — no active attack payloads, so it is safe to
run against a staging environment.

Runs on a **staging deployment** (not CI by default; scheduled + manual
dispatch via the `zap-baseline` workflow job).

## Run locally

Requires Docker.

```sh
ZAP_TARGET=https://staging.example.com/api/v1 ./test/zap/zap-baseline.sh
```

Reports are written to `test/zap/reports/` (HTML, JSON, Markdown, XML).
The script exits non-zero if any **HIGH**-risk alert is reported; WARN and
below are informational.

## CI

`.github/workflows/ci.yml` → `zap-baseline` job: runs weekly (Monday 03:00)
and on `workflow_dispatch` against `secrets.STAGING_URL` and uploads the HTML
report as a workflow artifact. Add the `STAGING_URL` secret (base URL
including `/api/v1`) on the repo settings page.

## Scope & limitations

- Unauthenticated baseline: public routes only (health, swagger when
  enabled, error responses). Authenticated attack scanning is a separate
  follow-up (ZAP context with `Bearer` token + active scan against a
  disposable seed environment).
- The throttler may rate-limit the scanner — whitelist the runner IP or
  raise `THROTTLE_LIMIT` on staging while scanning.
