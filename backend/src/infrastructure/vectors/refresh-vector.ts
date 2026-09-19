import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { QdrantClient } from '@qdrant/js-client-rest';
import { EmbeddingService } from '../ai/embedding.service';

const BATCH_SIZE = 100;

/** Standalone script — no NestJS bootstrap, so EmbeddingService gets a
 *  minimal config stub instead of the DI-resolved ConfigService. */
const configStub = {
  get: (key: string, defaultValue?: unknown) =>
    process.env[key] ?? defaultValue,
} as any;

async function main() {
  const prisma = new PrismaClient();
  const embedding = new EmbeddingService(configStub);

  // 1. Fetch up to 20k chunks from PostgreSQL
  const chunks = await prisma.chunk.findMany({
    take: 20000,
    include: { document: true },
    orderBy: { index: 'asc' },
  });

  console.log(`Fetched ${chunks.length} chunks from PostgreSQL`);

  if (chunks.length === 0) {
    console.log('No chunks found — nothing to refresh.');
    await prisma.$disconnect();
    process.exit(0);
  }

  // 2. Initialize Qdrant client
  const qdrantHost = process.env.QDRANT_HOST || 'localhost';
  const qdrantPort = Number(process.env.QDRANT_PORT || 6333);
  const qdrantApiKey = process.env.QDRANT_API_KEY || '';

  const qdrant = new QdrantClient({
    host: qdrantHost,
    port: qdrantPort,
    apiKey: qdrantApiKey || undefined,
    https: false,
  });

  // 3. Ensure collection exists (created with indexing_threshold 20000)
  const collectionName = 'knowledge_chunks';
  try {
    await qdrant.getCollection(collectionName);
    console.log(`Collection '${collectionName}' already exists`);
  } catch {
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: 1536, // EMBEDDING_DIMENSION default
        distance: 'Cosine',
      },
      optimizers_config: {
        indexing_threshold: 20000,
      },
    });
    console.log(
      `Created collection '${collectionName}' with indexing_threshold=20000`,
    );
  }

  // 4. Generate real embeddings and upsert into Qdrant, in batches — both to
  // stay under the embedding API's per-request size limits and so progress
  // survives a mid-run failure instead of losing all 20k chunks' work.
  let upserted = 0;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedding.generateEmbeddings(
      batch.map((c) => c.content),
    );

    const points = batch.map((chunk, j) => ({
      id: chunk.id,
      vector: vectors[j],
      payload: {
        documentId: chunk.documentId,
        content: chunk.content,
        index: chunk.index,
        tokenCount: chunk.tokenCount,
        createdAt: chunk.createdAt,
      },
    }));

    await qdrant.upsert(collectionName, { wait: true, points });
    upserted += points.length;
    console.log(`Upserted ${upserted}/${chunks.length} chunks...`);
  }

  console.log(
    `Successfully refreshed ${upserted} chunks into Qdrant collection '${collectionName}'`,
  );

  await prisma.$disconnect();
}

// Run main and exit on failure
main().catch((error) => {
  console.error('Vector refresh failed:', error);
  process.exit(1);
});
