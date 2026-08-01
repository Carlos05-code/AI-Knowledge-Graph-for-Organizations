# Deployment Guide

## Prerequisites

- Docker & Docker Compose (local development)
- Kubernetes cluster (production)
- kubectl configured
- Helm (for optional package management)
- Domain names configured (optional)

## Local Development Deployment

### 1. Start Infrastructure

```bash
docker-compose -f docker/docker-compose.yml up -d
```

This starts:
- PostgreSQL (port 5432)
- Neo4j (ports 7474, 7687)
- Qdrant (ports 6333, 6334)
- OpenSearch (port 9200)
- Redis (port 6379)
- RabbitMQ (ports 5672, 15672)
- MinIO (ports 9000, 9001)
- Keycloak (port 8080)
- Prometheus (port 9090)
- Grafana (port 3001)
- Loki (port 3100)

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Run Database Migrations

```bash
cd backend
npx prisma migrate dev
```

### 4. Start Backend

```bash
cd backend
npm run start:dev
```

### 5. Start Frontend

```bash
cd frontend
flutter run -d chrome
```

## Production Deployment (Kubernetes)

### 1. Create Namespace

```bash
kubectl create namespace akg
```

### 2. Configure Secrets

```bash
kubectl apply -f k8s/secrets.yml
```

### 3. Deploy Infrastructure

Deploy PostgreSQL, Neo4j, Redis, RabbitMQ, MinIO, and Qdrant using Helm charts or operators:

```bash
# Example: Deploy PostgreSQL
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install akg-postgres bitnami/postgresql -n akg

# Deploy Neo4j
helm install akg-neo4j neo4j/neo4j -n akg

# Deploy Redis
helm install akg-redis bitnami/redis -n akg

# Deploy RabbitMQ
helm install akg-rabbitmq bitnami/rabbitmq -n akg

# Deploy MinIO
helm install akg-minio minio/minio -n akg
```

### 4. Build and Push Images

```bash
docker build -f docker/Dockerfile.backend -t your-registry/akg-backend:latest .
docker build -f docker/Dockerfile.frontend -t your-registry/akg-frontend:latest .
docker push your-registry/akg-backend:latest
docker push your-registry/akg-frontend:latest
```

### 5. Deploy Application

```bash
kubectl apply -f k8s/backend-deployment.yml
kubectl apply -f k8s/frontend-deployment.yml
kubectl apply -f k8s/ingress.yml
```

### 6. Verify Deployment

```bash
kubectl -n akg get pods
kubectl -n akg get svc
kubectl -n akg get ingress
```

## Scaling Considerations

### Horizontal Scaling
- Backend: HPA configured for 3-10 replicas based on CPU (70% threshold)
- Frontend: HPA configured for 2-8 replicas based on CPU (70% threshold)

### Database Scaling
- PostgreSQL: Use read replicas for query offloading
- Neo4j: Enterprise edition supports clustering
- Qdrant: Supports distributed deployment

### Caching Strategy
- Redis for session cache, API response cache, rate limiting
- CDN for static frontend assets

## Monitoring

### Health Checks
- Liveness: `/api/v1/health/live`
- Readiness: `/api/v1/health/ready`
- Full health: `/api/v1/health`

### Metrics (Prometheus)
- `/api/v1/metrics` - Backend metrics

### Dashboards (Grafana)
- Access via port 3001 (local) or configured domain

## Backup & Recovery

### Database Backup

```bash
# PostgreSQL
pg_dump -h localhost -U postgres ai_knowledge_graph > backup.sql

# Neo4j
neo4j-admin dump --database=neo4j --to=backup.dump
```

### Object Storage (MinIO)
- Use `mc` client for bucket-level backup
- Configure S3-compatible backup target

## Security Checklist

- [ ] All secrets stored in Kubernetes Secrets
- [ ] TLS enabled via cert-manager
- [ ] Network policies applied
- [ ] Rate limiting configured
- [ ] JWT tokens with short expiry (15 min)
- [ ] Audit logging enabled
- [ ] Prometheus metrics secured
- [ ] RBAC configured for all service accounts
- [ ] Keycloak configured with strong password policy
- [ ] Regular security scanning in CI/CD
