# DevOps Specification

## 1. Docker

- Backend Dockerfile (multi-stage, `nest build` → slim runtime).
- Frontend Dockerfile (Flutter build → static nginx serve).
- Full compose stack in `docker/docker-compose.yml` (16 services, all with resource limits and healthchecks):

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
| promtail | - | container logs -> Loki (docker socket) |
| postgres-exporter | 9187 | DB metrics |
| node-exporter | 9100 | host metrics |

```bash
docker compose -f docker/docker-compose.yml up -d
```

## 2. Kubernetes

Manifests in `k8s/`: deployments + services + HPAs for backend and frontend, Ingress, and a
secrets manifest. Pods run hardened: non-root (backend node uid 1000; frontend nginx uid 101),
read-only root filesystem with emptyDir mounts (backend `/app/uploads`, frontend nginx
cache/run dirs), all capabilities dropped, seccomp RuntimeDefault, and
`terminationGracePeriodSeconds` tuned. PodDisruptionBudgets keep 2 backend / 1 frontend
replica available during node drains. Ingress TLS termination is the remaining staging item.

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

- **Metrics**: Prometheus default metrics plus HTTP request metrics at `/api/v1/metrics`:
  `http_requests_total{method,route,status}` counter and `http_request_duration_seconds`
  histogram, recorded by a global interceptor
  (`src/infrastructure/metrics/http-metrics.interceptor.ts`). Postgres exporter (`:9187`)
  and node exporter (`:9100`) provide DB and host metrics.
- **Logs**: winston JSON (`LOG_FORMAT=json`) collected from all containers by promtail
  (`docker/promtail/promtail-config.yml`, docker-socket discovery) and shipped to Loki;
  all three (Loki, Grafana, promtail) are in the compose stack with healthchecks.
- **Health**: `/health` (db/memory/disk), `/health/live`, `/health/ready` for probes.
- **Alerting**: `docker/prometheus/alerts.yml` ships with the stack — backend down, 5xx
  error rate > 5%, P95 latency > 2s, heap > 85%, host CPU/memory pressure, exporter/Redis
  down, Postgres connection count. Grafana provisions the `AKG Backend Overview` dashboard
  (`docker/grafana/dashboards/akg-backend.json`): request rate by status, P95 latency by
  route, heap, CPU, event loop lag, uptime, 5xx rate.

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
- AI latency/cost metrics per model call — staged.
- DONE: HTTP request duration histograms + error-rate panels (dashboard + alerts above).
