import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  DiskHealthIndicator,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infrastructure/database/prisma.service';
import { Neo4jService } from '../../src/infrastructure/graph/neo4j.service';
import { QdrantService } from '../../src/infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../../src/infrastructure/ai/embedding.service';
import { MinioStorageService } from '../../src/infrastructure/storage/minio-storage.service';
import { OpenSearchService } from '../../src/infrastructure/search/opensearch.service';

/**
 * Fresh per test file — each e2e spec file calls this once in its own
 * beforeAll (via bootstrapE2eApp), so no mock state leaks between files.
 */
export function createMockPrisma(): Record<string, any> {
  const mockPrisma: Record<string, any> = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    chunk: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    conversation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    connector: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    connectorRun: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    meeting: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    meetingParticipant: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    policy: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    invitation: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    expertiseScore: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    knowledgeGap: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    appSecret: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    outboundEmail: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    activityLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    userOrganization: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
  };
  mockPrisma.$transaction = jest.fn((fn: any) => fn(mockPrisma));
  return mockPrisma;
}

export function createMockNeo4j() {
  return {
    executeRaw: jest.fn(),
    createNode: jest.fn(),
    findNodes: jest.fn(),
    findNodeById: jest.fn(),
    queryNodes: jest.fn(),
    deleteNode: jest.fn(),
    findSubgraph: jest.fn(),
    getSubgraph: jest.fn(),
    searchNodes: jest.fn(),
    close: jest.fn(),
    onApplicationShutdown: jest.fn(),
  };
}

export function createMockQdrant() {
  return {
    search: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    createCollection: jest.fn(),
    collectionExists: jest.fn(),
    ensureCollection: jest.fn(),
    close: jest.fn(),
    onApplicationShutdown: jest.fn(),
  };
}

export function createMockEmbedding() {
  return {
    generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    generateEmbeddings: jest
      .fn()
      .mockResolvedValue([new Array(1536).fill(0.1)]),
  };
}

export function createMockMinio() {
  return {
    uploadFile: jest.fn(),
    getFile: jest.fn(),
    deleteFile: jest.fn(),
    getSignedUrl: jest.fn(),
  };
}

export function createMockOpenSearch() {
  return {
    isAvailable: jest.fn().mockReturnValue(false),
    search: jest.fn(),
    indexChunks: jest.fn(),
    deleteByDocumentId: jest.fn(),
  };
}

export interface E2EContext {
  app: INestApplication;
  jwtService: JwtService;
  validToken: string;
  adminToken: string;
  viewerToken: string;
  mockPrisma: ReturnType<typeof createMockPrisma>;
  mockNeo4j: ReturnType<typeof createMockNeo4j>;
  mockQdrant: ReturnType<typeof createMockQdrant>;
  mockEmbedding: ReturnType<typeof createMockEmbedding>;
  mockMinio: ReturnType<typeof createMockMinio>;
  mockOpenSearch: ReturnType<typeof createMockOpenSearch>;
}

/**
 * Boots a full AppModule with all infra providers mocked. Call once per spec file's beforeAll.
 *
 * `realOpenSearch: true` skips the OpenSearchService override so it connects
 * to whatever OPENSEARCH_HOST is configured — used by the one suite that
 * verifies the real BM25 integration against a CI-provisioned cluster.
 * Every other spec gets the deterministic mock (isAvailable() === false),
 * which is what actually happened by accident before this option existed:
 * no real cluster was ever reachable from this sandbox, so OpenSearchService
 * always failed to connect and every e2e test exercised the Postgres ILIKE
 * fallback path. Making that explicit means it no longer depends on there
 * being no cluster around to fail into.
 */
export async function bootstrapE2eApp(
  options: { realOpenSearch?: boolean } = {},
): Promise<E2EContext> {
  const mockPrisma = createMockPrisma();
  const mockNeo4j = createMockNeo4j();
  const mockQdrant = createMockQdrant();
  const mockEmbedding = createMockEmbedding();
  const mockMinio = createMockMinio();
  const mockOpenSearch = createMockOpenSearch();

  let builder = Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(mockPrisma)
    .overrideProvider(Neo4jService)
    .useValue(mockNeo4j)
    .overrideProvider(QdrantService)
    .useValue(mockQdrant)
    .overrideProvider(EmbeddingService)
    .useValue(mockEmbedding)
    .overrideProvider(MinioStorageService)
    .useValue(mockMinio)
    .overrideProvider(DiskHealthIndicator)
    .useValue({
      checkStorage: jest
        .fn()
        .mockResolvedValue({ disk: { status: 'up', free: 1000000 } }),
    })
    .overrideProvider(PrismaHealthIndicator)
    .useValue({
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    })
    .overrideProvider(MemoryHealthIndicator)
    .useValue({
      checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }),
    });

  if (!options.realOpenSearch) {
    builder = builder
      .overrideProvider(OpenSearchService)
      .useValue(mockOpenSearch);
  }

  const moduleFixture: TestingModule = await builder.compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('/api/v1');
  await app.init();

  const jwtService = app.get(JwtService);

  const validToken = jwtService.sign({
    sub: 'user-1',
    email: 'user@test.com',
    orgId: 'org-1',
    role: 'USER',
  });
  const adminToken = jwtService.sign({
    sub: 'admin-1',
    email: 'admin@test.com',
    orgId: 'org-1',
    role: 'ADMIN',
  });
  const viewerToken = jwtService.sign({
    sub: 'viewer-1',
    email: 'viewer@test.com',
    orgId: 'org-1',
    role: 'VIEWER',
  });

  return {
    app,
    jwtService,
    validToken,
    adminToken,
    viewerToken,
    mockPrisma,
    mockNeo4j,
    mockQdrant,
    mockEmbedding,
    mockMinio,
    mockOpenSearch,
  };
}

/** Call in each spec file's beforeEach — clears mocks and reinstates the shared defaults every test relied on implicitly. */
export function resetE2eMockDefaults(ctx: E2EContext) {
  const { mockPrisma, mockNeo4j, mockQdrant, mockOpenSearch } = ctx;
  jest.clearAllMocks();
  mockOpenSearch.isAvailable.mockReturnValue(false);

  mockPrisma.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'user@test.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'USER',
    isActive: true,
    organizationId: 'org-1',
    organization: { id: 'org-1', name: 'Test Org' },
  });
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.user.count.mockResolvedValue(0);
  mockPrisma.document.findMany.mockResolvedValue([]);
  mockPrisma.document.count.mockResolvedValue(0);
  mockPrisma.chunk.findMany.mockResolvedValue([]);
  mockPrisma.conversation.findMany.mockResolvedValue([]);
  mockPrisma.message.findMany.mockResolvedValue([]);
  mockPrisma.notification.findMany.mockResolvedValue([]);
  mockPrisma.notification.count.mockResolvedValue(0);
  mockPrisma.knowledgeGap.findMany.mockResolvedValue([]);
  mockPrisma.knowledgeGap.count.mockResolvedValue(0);
  mockPrisma.expertiseScore.findMany.mockResolvedValue([]);
  mockPrisma.connector.findMany.mockResolvedValue([]);
  mockPrisma.connector.count.mockResolvedValue(0);
  mockPrisma.meeting.count.mockResolvedValue(0);
  mockPrisma.meeting.findMany.mockResolvedValue([]);
  mockPrisma.meetingParticipant.findMany.mockResolvedValue([]);
  mockQdrant.search.mockResolvedValue([]);
  mockNeo4j.findNodes.mockResolvedValue([]);
  mockNeo4j.searchNodes.mockResolvedValue([]);
  mockNeo4j.queryNodes.mockResolvedValue([]);
  mockNeo4j.findSubgraph.mockResolvedValue([]);
  mockNeo4j.getSubgraph.mockResolvedValue([]);
  mockNeo4j.executeRaw.mockResolvedValue([]);
  mockNeo4j.createNode.mockResolvedValue(undefined);
  mockNeo4j.findNodeById.mockResolvedValue(null);
}

/** ADMIN-role user fixture — used across many spec files to elevate a request past RolesGuard. */
export const adminUserFixture = {
  id: 'admin-1',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'User',
  role: 'ADMIN',
  isActive: true,
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'Test Org' },
};

/** VIEWER-role user fixture — used by the read-only enforcement tests. */
export const viewerUserFixture = {
  id: 'viewer-1',
  email: 'viewer@test.com',
  firstName: 'Vera',
  lastName: 'Viewer',
  role: 'VIEWER',
  isActive: true,
  organizationId: 'org-1',
  organization: { id: 'org-1', name: 'Test Org' },
};
