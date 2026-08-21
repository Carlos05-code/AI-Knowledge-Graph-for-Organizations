import 'reflect-metadata';
import { PrismaClient } from '../../infrastructure/database/prisma.service';
import { QdrantClient, models } from '@qdrant/js-client-rest';

async function main() {
  const prisma = new PrismaClient();

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
    await qdrant.recollections(collectionName);
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
    console.log(`Created collection '${collectionName}' with indexing_threshold=20000`);
  }

  // 4. Upsert chunks into Qdrant
  // We'll use the chunk content as the payload; vector would normally come from embedding service.
  // For this refresh we set a dummy vector (zeros) and store content in payload.
  // In production the embedding service would generate real vectors.
  const vectorSize = 1536;

  const points = chunks.map((chunk, idx) => ({
    id: chunk.id,
    vector: Array(vectorSize).fill(0), // dummy vector — replace with real embeddings
    payload: {
      documentId: chunk.documentId,
      content: chunk.content,
      index: chunk.index,
      tokenCount: chunk.tokenCount,
      createdAt: chunk.createdAt,
    },
  }));

  console.log(`Upserting ${points.length} points into Qdrant...`;

  await qdrant.upsert(collectionName, {
    wait: true,
    points,
  });

  console.log(`Successfully refreshed ${points.length} chunks into Qdrant collection '${collectionName}'`);

  await prisma.$disconnect();
}

// Run main and exit on failure
main().catch((error) => {
  console.error('Vector refresh failed:', error);
  process.exit(1);
});