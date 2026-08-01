# ADR-005: Deterministic fallback embeddings

- **Status**: Accepted
- **Date**: 2026-08
- **Context**: Embeddings normally come from OpenAI `text-embedding-3-small`. Without an
  API key (CI, local demo, offline), the pipeline would fail entirely, blocking search,
  chat, recommendations and tests.
- **Decision**: `EmbeddingService` catches embedding failures and returns a
  **deterministic hashed pseudo-embedding** (fixed dimension, L2-normalized) derived from
  the input text, logging the failure explicitly. Qdrant stores whatever vectors it
  receives; `EMBEDDING_DIMENSION` is shared by both paths.
- **Consequences**:
  - + Pipeline remains functional and testable offline; no fake silent success (logged).
  - + Same input yields the same vector, so chunk upserts are idempotent.
  - - Semantic quality collapses to near-zero when the fallback is active, so production
    must always supply `OPENAI_API_KEY` and alert on fallback logs.
