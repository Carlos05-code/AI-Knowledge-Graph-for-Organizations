# AI Knowledge Graph for Organizations

> An enterprise AI-powered Organizational Knowledge Engine that connects scattered information across your company into a searchable, queryable knowledge graph.

[![CI](https://github.com/your-org/ai-knowledge-graph/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/ai-knowledge-graph/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196)](https://conventionalcommits.org)

---

## Overview

Organizations lose enormous amounts of knowledge because information is scattered across emails, PDFs, Google Drive, Slack, Notion, Confluence, GitHub, Jira, and employee minds.

**AI Knowledge Graph** solves this by:

- **Ingesting** data from 20+ sources via universal connectors
- **Understanding** content through AI-powered document processing
- **Connecting** information automatically into a knowledge graph
- **Searching** across everything with hybrid search (BM25 + Vector + Graph)
- **Answering** questions with RAG, providing citations for every claim
- **Discovering** experts, gaps, and hidden relationships

Think of it as ChatGPT + Notion AI + Glean + GraphRAG, built for enterprise.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Flutter Frontend                      │
│  (Desktop-first, responsive, dark mode, keyboard-nav)   │
└──────────────────┬──────────────────────────────────────┘
                   │ REST API (OpenAPI)
┌──────────────────▼──────────────────────────────────────┐
│                  NestJS Backend                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ Auth     │  │Documents │  │   Chat   │  │ Search │  │
│  │ Module   │  │ Module   │  │  Module  │  │ Module │  │
│  ├──────────┤  ├──────────┤  ├──────────┤  ├────────┤  │
│  │Connectors│  │  Graph   │  │ Meetings │  │ Notif. │  │
│  │ Module   │  │ Module   │  │  Module  │  │ Module │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│  ┌──────────────────────────────────────────────────┐    │
│  │          Clean Architecture Layers               │    │
│  │  Domain → Application → Infrastructure → Present │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│                   Infrastructure                         │
│  PostgreSQL  Neo4j  Qdrant  OpenSearch  Redis  RabbitMQ │
│  MinIO  Keycloak  Prometheus  Grafana  Loki             │
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Category       | Technology                                      |
| -------------- | ----------------------------------------------- |
| Frontend       | Flutter 3.35+                                   |
| Backend        | NestJS (Node.js 24)                             |
| Database       | PostgreSQL 16                                   |
| Knowledge Graph| Neo4j 5                                         |
| Vector DB      | Qdrant                                          |
| Search Engine  | OpenSearch 2.x                                  |
| Cache          | Redis 7                                        |
| Message Queue  | RabbitMQ 3                                     |
| Object Store   | MinIO                                          |
| Auth           | Keycloak + JWT                                  |
| AI             | OpenAI GPT-4o / text-embedding-3-small          |
| Monitoring     | Prometheus + Grafana + Loki                     |
| Container      | Docker + Kubernetes                             |
| CI/CD          | GitHub Actions                                  |

---

## Features

### Universal Connectors
Ingest from: Google Drive, OneDrive, SharePoint, Gmail, Outlook, Slack, Teams, Dropbox, Notion, Confluence, GitHub, GitLab, Jira, Linear, local files (PDF, DOCX, PPTX, XLSX, MD, HTML, images).

### Document Processing Pipeline
Upload → OCR → Parse → Clean → Chunk → Extract Metadata → Generate Embeddings → Extract Knowledge Graph → Index → AI Ready

### AI Chat with RAG
Ask natural language questions. Get answers with citations. Powered by hybrid retrieval + LLM reasoning.

### Enterprise Search
Three modes: Keyword (BM25), Semantic (Vector), Hybrid (BM25 + Vector + Knowledge Graph).

### Automatic Knowledge Graph
Extracts entities and relationships automatically from documents. Builds a living map of your organization.

### Knowledge Graph Explorer
Interactive graph visualization. Expand nodes, filter relationships, discover hidden connections.

### Expertise Discovery
"Who knows Kubernetes?" — ranked by commits, docs, tickets, PRs, meetings.

### Meeting Intelligence
Transcription, AI summaries, action items, decisions, entity extraction.

### Policy Search
Ask policy questions, get answers with specific policy references and version citations.

### Knowledge Gap Detection
Detects undocumented services, stale docs, conflicting policies, orphan repos.

### Recommendations
Experts, similar incidents, relevant docs, reusable code, related meetings.

---

## Getting Started

### Prerequisites
- Node.js 20+
- Flutter 3.35+
- Docker & Docker Compose
- npm or yarn

### Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/ai-knowledge-graph.git
cd ai-knowledge-graph

# Start infrastructure
docker-compose up -d

# Install backend dependencies
cd backend
npm install

# Run database migrations
npm run prisma:migrate

# Start backend
npm run start:dev

# Install frontend dependencies
cd ../frontend
flutter pub get

# Start frontend
flutter run -d chrome
```

### Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

---

## Project Structure

```
ai-knowledge-graph/
├── backend/                    # NestJS backend
│   ├── src/
│   │   ├── domain/             # Entities, Value Objects, Interfaces
│   │   ├── application/        # Use cases, DTOs, Ports
│   │   ├── infrastructure/     # DB, search, storage, external services
│   │   ├── presentation/       # Controllers, guards, filters
│   │   ├── modules/            # Feature modules
│   │   │   ├── auth/
│   │   │   ├── connectors/
│   │   │   ├── documents/
│   │   │   ├── graph/
│   │   │   ├── chat/
│   │   │   ├── search/
│   │   │   ├── meetings/
│   │   │   ├── notifications/
│   │   │   └── admin/
│   │   ├── shared/             # Common utilities
│   │   └── config/             # Configuration
│   ├── prisma/                 # Database schema & migrations
│   └── test/                   # Tests
├── frontend/                   # Flutter frontend
│   └── lib/
│       ├── core/               # Theme, routing, networking
│       └── features/           # Feature modules
│           ├── auth/
│           ├── chat/
│           ├── search/
│           ├── graph/
│           ├── documents/
│           ├── connectors/
│           ├── meetings/
│           ├── notifications/
│           └── admin/
├── docker/                     # Docker configs
├── k8s/                        # Kubernetes manifests
├── docs/                       # Documentation
├── scripts/                    # Utility scripts
└── tests/                      # E2E tests
```

---

## API Documentation

Once running, API docs are available at:
- Swagger: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`

---

## Deployment

See [Deployment Guide](docs/deployment-guide.md) for:
- Docker Compose deployment
- Kubernetes deployment
- Scaling considerations
- Environment-specific configuration

---

## Testing

```bash
# Backend tests
cd backend
npm run test
npm run test:e2e
npm run test:cov

# Frontend tests
cd frontend
flutter test
flutter test --coverage
```

---

## License

MIT License — see [LICENSE](LICENSE)

## Security

See [SECURITY.md](SECURITY.md) for security policies and vulnerability reporting.
# AI-Knowledge-Graph-for-Organizations.
