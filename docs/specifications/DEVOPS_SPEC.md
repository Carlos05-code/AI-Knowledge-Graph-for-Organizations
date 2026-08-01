# DevOps Specification

## 1. Docker

- Backend Dockerfile (multi-stage, `nest build` → slim runtime).
- Frontend Dockerfile (Flutter build → static nginx serve).
- Full compose stack in `docker/docker-compose.yml` (13 services):

| Service | Port (host) | Notes |
|---|---|---|
| postgres | 5432 | PostgreSQL 16, named volume |
| neo4j | 7687 (bolt), 7474 (http) | APOC plugin enabled |
| qdrant | 6333 | vectors |
| redis | 6379 | cache |
| rabbitmq | 5672, 15672 | management UI |
| minio | 9000, 9001 | S3 + console |
| opensearch | 9200 | search (reserved) |
| backend | 3000 | API |
| frontend | 4200 | Flutter web served |
| grafana / prometheus / loki | 3001 / 9090 / 3100 | observability |

```bash
docker compose -f docker/docker-compose.yml up -d
```

## 2. Kubernetes

Manifests in `k8s/` — deployments + services for backend, frontend, postgres; secrets via
env. Production tuning (HPA, PDBs, Ingress TLS) is staged.

## 3. GitHub Actions (CI)

`.github/workflows/ci.yml` on push/PR:

1. **Backend job**: install → lint → unit tests → e2e tests → build → Docker build (tagged `sha-`).
2. **Frontend job**: flutter pub get → analyze → test → build web → Docker build.
3. **Compose job**: `docker compose config` validation.

## 4. Environment strategy

| Env | Purpose | Config |
|---|---|---|
| local | dev machine | `.env` (only `DATABASE_URL` needed to boot; others default) |
| ci | GitHub Actions | defaults + ephemeral services |
| staging / prod | planned | full `.env` + K8s secrets; `LOG_FORMAT=json`, `CORS_ORIGINS` pinned |

## 5. Deployment

- Current local run: PostgreSQL service + `node dist/main.js` + `flutter run -d chrome --web-port 4200`.
- Container deploy: compose stack above; K8s manifests for production rollout.
- Blue/green or rolling upgrade: K8s `RollingUpdate` (default).

## 6. Monitoring & logging

- **Metrics**: Prometheus default metrics at `/api/v1/metrics` (prom-client).
- **Logs**: winston JSON (`LOG_FORMAT=json`) → Loki → Grafana (compose includes all three).
- **Health**: `/health` (db/memory/disk), `/health/live`, `/health/ready` for probes.
- **Alerting**: Grafana dashboards (staged).

## 7. Backups & disaster recovery

- PostgreSQL: volume backups (`pg_dump` cron recommended); restore procedure documented
  in `docs/deployment-guide.md`.
- Neo4j/Qdrant: volume snapshots; re-index from source of truth (Postgres + MinIO) if lost.
- RPO/RTO targets: staged for production.

## 8. Scaling

- API: stateless → horizontal scale behind Ingress/LB; throttler ready.
- DB: connection pool (Prisma 9 connections default); read replica later.
- Queue: RabbitMQ consumers on separate replicas (seam exists).
- Vectors: Qdrant horizontal clustering (production roadmap).

## 9. Observability roadmap

- OpenTelemetry traces (dependency available) — staged.
- Request duration histograms + error-rate panels.
- AI latency/cost metrics per model call.
