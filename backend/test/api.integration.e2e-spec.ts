import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  DiskHealthIndicator,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import request from 'supertest';
jest.mock('uuid', () => ({ v4: () => 'fixed-uuid-for-testing' }));
jest.mock('amqplib', () => ({
  connect: jest.fn().mockResolvedValue({
    createChannel: jest.fn().mockResolvedValue({
      assertQueue: jest.fn(),
      consume: jest.fn(),
      ack: jest.fn(),
    }),
  }),
}));
jest.mock('amqp-connection-manager', () => ({
  connect: jest
    .fn()
    .mockReturnValue({ createChannel: jest.fn().mockResolvedValue({}) }),
}));
jest.mock('cache-manager-redis-yet', () => ({
  redisStore: jest
    .fn()
    .mockResolvedValue({ get: jest.fn(), set: jest.fn(), del: jest.fn() }),
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest
    .fn()
    .mockImplementation((pw, _hash) => Promise.resolve(pw === 'password123')),
}));
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { Neo4jService } from '../src/infrastructure/graph/neo4j.service';
import { QdrantService } from '../src/infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../src/infrastructure/ai/embedding.service';
import { MinioStorageService } from '../src/infrastructure/storage/minio-storage.service';
import { JwtService } from '@nestjs/jwt';

describe('API Integration (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let validToken: string;
  let adminToken: string;
  let viewerToken: string;

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
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
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
    $transaction: jest.fn((fn) => fn(mockPrisma)),
  };

  const mockNeo4j = {
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

  const mockQdrant = {
    search: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    createCollection: jest.fn(),
    collectionExists: jest.fn(),
    ensureCollection: jest.fn(),
    close: jest.fn(),
    onApplicationShutdown: jest.fn(),
  };

  const mockEmbedding = {
    generateEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    generateEmbeddings: jest
      .fn()
      .mockResolvedValue([new Array(1536).fill(0.1)]),
  };

  const mockMinio = {
    uploadFile: jest.fn(),
    getFile: jest.fn(),
    deleteFile: jest.fn(),
    getSignedUrl: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
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
        checkHeap: jest
          .fn()
          .mockResolvedValue({ memory_heap: { status: 'up' } }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix('/api/v1');
    await app.init();

    jwtService = app.get(JwtService);

    validToken = jwtService.sign({
      sub: 'user-1',
      email: 'user@test.com',
      orgId: 'org-1',
      role: 'USER',
    });
    adminToken = jwtService.sign({
      sub: 'admin-1',
      email: 'admin@test.com',
      orgId: 'org-1',
      role: 'ADMIN',
    });
    viewerToken = jwtService.sign({
      sub: 'viewer-1',
      email: 'viewer@test.com',
      orgId: 'org-1',
      role: 'VIEWER',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
    // Default return values for commonly used mocks
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
  });

  // ─── Health ────────────────────────────────────────────────────

  describe('Health', () => {
    it('GET /api/v1/health should return status', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBeDefined();
        });
    });

    it('GET /api/v1/health/live should return ok', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe('ok');
        });
    });
  });

  // ─── Auth ──────────────────────────────────────────────────────

  describe('Auth', () => {
    const loginDto = { email: 'new@test.com', password: 'password123' };
    const registerDto = {
      email: 'new@test.com',
      firstName: 'John',
      lastName: 'Doe',
      password: 'password123',
    };

    it('POST /api/v1/auth/register should create user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const org = { id: 'org-1', name: 'Test Org' };
      const user = {
        id: 'user-2',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: 'USER',
      };

      mockPrisma.organization.create.mockResolvedValue(org);
      mockPrisma.user.create.mockResolvedValue(user);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.data.accessToken).toBeDefined();
          expect(res.body.data.refreshToken).toBeDefined();
          expect(res.body.data.user.email).toBe(registerDto.email);
        });
    });

    it('POST /api/v1/auth/login should validate credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: '$2b$10$hashedpassword',
        role: 'USER',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(200);
    });

    it('POST /api/v1/auth/login should reject invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'unknown@test.com', password: 'password123' })
        .expect(401);
    });

    it('POST /api/v1/auth/refresh should rotate the refresh token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'rt-old',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.refreshToken.update.mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ token: 'rt-new' });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'st-old' })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.refreshToken).toBeDefined();
        });
    });

    it('POST /api/v1/auth/refresh should reject a revoked token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'rt-revoked',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'rt-revoked' })
        .expect(401);
    });

    it('POST /api/v1/auth/logout should revoke a refresh token', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'st-old' })
        .expect(200);
    });
  });

  // ─── Documents ─────────────────────────────────────────────────

  describe('Documents', () => {
    const createDto = {
      title: 'Test Document',
      filePath: '/uploads/test.pdf',
      fileType: 'pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      checksum: 'abc123def456',
    };

    it('POST /api/v1/documents should create document (ADMIN)', async () => {
      mockPrisma.document.create.mockResolvedValue({
        id: 'doc-1',
        ...createDto,
        status: 'PENDING',
      });
      mockNeo4j.createNode.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(createDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.data.title).toBe(createDto.title);
        });
    });

    it('GET /api/v1/documents should list documents', async () => {
      mockPrisma.document.findMany.mockResolvedValue([
        { id: 'doc-1', title: 'Doc 1' },
      ]);
      mockPrisma.document.count.mockResolvedValue(1);

      await request(app.getHttpServer())
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });

    it('GET /api/v1/documents should coerce string query pagination to integers', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/v1/documents?page=2&limit=5')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)
        .expect((res) => {
          const meta = res.body.data.meta;
          expect(meta.page).toBe(2);
          expect(meta.limit).toBe(5);
        });

      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('DELETE /api/v1/documents/:id should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/documents/doc-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);
    });
  });

  // ─── Search ────────────────────────────────────────────────────

  describe('Search', () => {
    it('GET /api/v1/search should return results', async () => {
      mockQdrant.search.mockResolvedValue([
        {
          id: 'chunk-1',
          score: 0.95,
          payload: {
            documentId: 'doc-1',
            text: 'test content',
            title: 'Doc 1',
            content: 'test content',
            type: 'chunk',
          },
        },
      ]);
      mockPrisma.document.findMany.mockResolvedValue([
        {
          id: 'doc-1',
          title: 'Doc 1',
          description: 'Test',
          fileType: 'pdf',
          source: null,
        },
      ]);
      mockPrisma.chunk.findMany.mockResolvedValue([
        {
          id: 'chunk-1',
          content: 'test content',
          documentId: 'doc-1',
          document: { title: 'Doc 1' },
        },
      ]);
      mockNeo4j.searchNodes.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/search?q=test&mode=hybrid')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.meta).toBeDefined();
        });
    });

    it('GET /api/v1/search/suggestions should return suggestions', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/search/suggestions?q=test')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  // ─── Graph ─────────────────────────────────────────────────────

  describe('Graph', () => {
    it('GET /api/v1/graph/nodes should require auth', async () => {
      await request(app.getHttpServer()).get('/api/v1/graph/nodes').expect(401);
    });

    it('GET /api/v1/graph/nodes should list nodes with auth', async () => {
      mockNeo4j.findNodes.mockResolvedValue([
        { id: 'node-1', name: 'Entity 1', type: 'document' },
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/graph/nodes')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });

    it('POST /api/v1/graph/query should require ADMIN role', async () => {
      mockNeo4j.executeRaw.mockResolvedValue([
        { n: { id: '1', name: 'Result' } },
      ]);

      await request(app.getHttpServer())
        .post('/api/v1/graph/query')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ query: 'MATCH (n) RETURN n LIMIT 10' })
        .expect(403);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });

      await request(app.getHttpServer())
        .post('/api/v1/graph/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ query: 'MATCH (n) RETURN n LIMIT 10' })
        .expect(201);
    });
  });

  // ─── Chat ──────────────────────────────────────────────────────

  describe('Chat', () => {
    it('POST /api/v1/chat/messages should send message and get reply', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);
      mockPrisma.conversation.create.mockResolvedValue({
        id: 'conv-1',
        title: 'Test',
        userId: 'user-1',
      });
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg-1',
        role: 'assistant',
        content: 'AI response',
      });

      await request(app.getHttpServer())
        .post('/api/v1/chat/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ content: 'What is our deployment process?' })
        .expect(201)
        .expect((res) => {
          expect(res.body.data.message || res.body.data.content).toBeDefined();
        });
    });

    it('GET /api/v1/chat/conversations should list conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          title: 'Deployment',
          userId: 'user-1',
          createdAt: new Date(),
        },
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  // ─── Connectors ────────────────────────────────────────────────

  describe('Connectors', () => {
    it('POST /api/v1/connectors should require ADMIN', async () => {
      const dto = {
        name: 'Test Drive',
        type: 'GOOGLE_DRIVE',
        credentials: '{"key":"val"}',
      };
      mockNeo4j.executeRaw.mockResolvedValue([]);

      await request(app.getHttpServer())
        .post('/api/v1/connectors')
        .set('Authorization', `Bearer ${validToken}`)
        .send(dto)
        .expect(403);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.connector.findMany.mockResolvedValue([]);
      mockPrisma.connector.create.mockResolvedValue({ id: 'conn-1', ...dto });
      await request(app.getHttpServer())
        .post('/api/v1/connectors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(dto)
        .expect(201);
    });

    it('POST /api/v1/connectors should reject invalid type', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      await request(app.getHttpServer())
        .post('/api/v1/connectors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Bad', type: 'not_a_type', credentials: '{}' })
        .expect(400);
    });

    it('GET /api/v1/connectors should list org connectors', async () => {
      mockPrisma.connector.findMany.mockResolvedValue([
        {
          id: 'conn-1',
          name: 'Engineering Slack',
          type: 'SLACK',
          credentials: '{"token":"xoxb-test"}',
          config: {},
          isEnabled: true,
          lastSyncAt: null,
          runs: [],
        },
      ]);
      const res = await request(app.getHttpServer())
        .get('/api/v1/connectors')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].type).toBe('SLACK');
      expect(mockPrisma.connector.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
    });

    it('POST /api/v1/connectors/:id/test should require ADMIN', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/connectors/conn-1/test')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);
    });

    it('POST /api/v1/connectors/:id/sync should sync documents via the Slack adapter', async () => {
      const fetchSpy = jest.spyOn(global as any, 'fetch');
      fetchSpy.mockImplementation((url: unknown) => {
        const target = String(url);
        if (target.includes('files.list')) {
          return {
            ok: true,
            json: () =>
              Promise.resolve({
                ok: true,
                files: [
                  {
                    id: 'E2E_FILE',
                    name: 'notes.txt',
                    filetype: 'text',
                    mimetype: 'text/plain',
                    size: 14,
                    url_private: 'https://files.slack.com/e2e',
                  },
                ],
              }),
          };
        }
        if (target.includes('/e2e')) {
          return {
            ok: true,
            arrayBuffer: () =>
              Promise.resolve(
                Buffer.from('hello from e2e\n').buffer.slice(0, 14),
              ),
          };
        }
        throw new Error(`Unexpected fetch URL: ${target}`);
      });

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.connector.findFirst.mockResolvedValue({
        id: 'conn-1',
        name: 'Engineering Slack',
        type: 'SLACK',
        credentials: '{"token":"xoxb-test"}',
        config: {},
        isEnabled: true,
        lastSyncAt: null,
        organizationId: 'org-1',
      });
      mockPrisma.connectorRun.create.mockResolvedValue({ id: 'run-1' });
      mockPrisma.connectorRun.update.mockResolvedValue({ id: 'run-1' });
      mockPrisma.connector.update.mockResolvedValue({ id: 'conn-1' });
      mockPrisma.document.create.mockResolvedValue({ id: 'doc-e2e' });
      mockPrisma.chunk.createMany.mockResolvedValue({ count: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/connectors/conn-1/sync')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.data.documentsSynced).toBe(1);
      expect(res.body.data.runId).toBe('run-1');
      expect(mockPrisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ title: 'notes.txt' }),
        }),
      );
      expect(mockPrisma.connectorRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      fetchSpy.mockRestore();
    });
  });

  // ─── Notifications ─────────────────────────────────────────────

  describe('Notifications', () => {
    it('GET /api/v1/notifications should list user notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([
        {
          id: 'notif-1',
          title: 'Doc processed',
          message: 'Your document is ready',
          isRead: false,
          createdAt: new Date(),
        },
      ]);
      mockPrisma.notification.count.mockResolvedValue(1);

      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  // ─── Invitations ────────────────────────────────────────────────

  describe('Invitations', () => {
    it('POST /api/v1/invitations should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ email: 'jane@test.com' })
        .expect(403);
    });

    it('POST /api/v1/invitations should create an invitation (admin)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.invitation.findFirst.mockResolvedValue(null);
      mockPrisma.invitation.create.mockResolvedValue({
        id: 'inv-1',
        email: 'jane@test.com',
        role: 'USER',
        status: 'PENDING',
        token: 'token-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedById: 'admin-1',
        organizationId: 'org-1',
      });

      await request(app.getHttpServer())
        .post('/api/v1/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'jane@test.com', role: 'USER' })
        .expect(201);
    });

    it('GET /api/v1/invitations should list invitations (admin)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.invitation.findMany.mockResolvedValue([
        {
          id: 'inv-1',
          email: 'jane@test.com',
          role: 'USER',
          status: 'PENDING',
          createdAt: new Date(),
          invitedBy: { id: 'admin-1', firstName: 'Admin', lastName: 'User' },
        },
      ]);
      mockPrisma.invitation.count.mockResolvedValue(1);

      await request(app.getHttpServer())
        .get('/api/v1/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('POST /api/v1/invitations/:id/revoke should revoke a pending invitation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        status: 'PENDING',
      });
      mockPrisma.invitation.update.mockResolvedValue({
        id: 'inv-1',
        status: 'REVOKED',
      });

      await request(app.getHttpServer())
        .post('/api/v1/invitations/inv-1/revoke')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
    });

    it('POST /api/v1/invitations/:id/resend should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/invitations/inv-1/resend')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);
    });

    it('POST /api/v1/invitations/:id/resend should refresh token + expiry and resend (admin)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        email: 'jane@test.com',
        role: 'USER',
        status: 'PENDING',
        token: 'old-token',
        invitedById: 'admin-1',
        organizationId: 'org-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
      });
      mockPrisma.invitation.update.mockResolvedValue({
        id: 'inv-1',
        email: 'jane@test.com',
        role: 'USER',
        status: 'PENDING',
        token: 'new-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/invitations/inv-1/resend')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(res.body.data.token).toBe('new-token');
      expect(res.body.data.status).toBe('PENDING');
      const updateArgs = mockPrisma.invitation.update.mock.calls[0][0];
      expect(updateArgs.data.token).not.toBe('old-token');
    });

    it('POST /api/v1/invitations/:id/resend should reject non-pending invitations', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.invitation.findFirst.mockResolvedValue({
        id: 'inv-1',
        status: 'ACCEPTED',
      });

      await request(app.getHttpServer())
        .post('/api/v1/invitations/inv-1/resend')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('POST /api/v1/invitations/accept should create the user and mark accepted', async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1',
        email: 'jane@test.com',
        organizationId: 'org-1',
        role: 'USER',
        status: 'PENDING',
        invitedById: 'admin-1',
        token: 'token-1',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-jane',
        email: 'jane@test.com',
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'USER',
        organizationId: 'org-1',
      });
      mockPrisma.invitation.update.mockResolvedValue({
        id: 'inv-1',
        status: 'ACCEPTED',
      });
      mockPrisma.notification.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({
          token: 'token-1',
          email: 'jane@test.com',
          firstName: 'Jane',
          lastName: 'Doe',
          password: 'password123',
        })
        .expect(201);
    });
  });

  // ─── Expertise ─────────────────────────────────────────────────

  describe('Expertise', () => {
    it('GET /api/v1/expertise/search should find experts', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-2',
          firstName: 'Jane',
          lastName: 'Doe',
          title: 'ML Engineer',
          expertiseScores: [],
        },
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/expertise/search?topic=ML')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  // ─── Gaps ──────────────────────────────────────────────────────

  describe('Gaps', () => {
    it('GET /api/v1/gaps should list knowledge gaps', async () => {
      mockPrisma.knowledgeGap.findMany.mockResolvedValue([
        {
          id: 'gap-1',
          topic: 'API Documentation',
          description: 'Missing',
          severity: 'high',
          resolvedAt: null,
        },
      ]);
      mockPrisma.knowledgeGap.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/gaps')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  // ─── Recommendations ───────────────────────────────────────────

  describe('Recommendations', () => {
    it('GET /api/v1/recommendations should return personalized recommendations', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        title: 'Engineer',
        department: 'Engineering',
        isActive: true,
        organizationId: 'org-1',
        role: 'USER',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.message.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/recommendations')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);
    });
  });

  // ─── Upload ────────────────────────────────────────────────────

  describe('Upload', () => {
    it('POST /api/v1/upload should require authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/upload').expect(401);
    });
  });

  // ─── Admin ─────────────────────────────────────────────────────

  describe('Admin', () => {
    it('GET /api/v1/admin/dashboard should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      mockPrisma.document.count.mockResolvedValue(10);
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.notification.count.mockResolvedValue(3);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('POST /api/v1/admin/secrets/rotate-jwt should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/secrets/rotate-jwt')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);
    });

    it('POST /api/v1/admin/secrets/rotate-jwt rotates the JWT secret', async () => {
      mockPrisma.appSecret.findMany.mockResolvedValue([{ version: 1 }]);
      mockPrisma.appSecret.create.mockResolvedValue({ id: 'sec-2' });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/secrets/rotate-jwt')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const data = response.body.data;
      expect(data).toMatchObject({
        version: 2,
        rotatedAt: expect.any(String),
      });
      expect(data.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(mockPrisma.appSecret.create).toHaveBeenCalled();
      const stored = mockPrisma.appSecret.create.mock.calls[0][0].data.value;
      expect(stored).not.toContain(data.secret);
      expect(stored.startsWith('akg:v')).toBe(true);
    });
  });

  // ─── Users ────────────────────────────────────────────────────

  describe('Users', () => {
    it('GET /api/v1/users/me should return current profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Engineer',
        department: 'Eng',
        role: 'USER',
        isActive: true,
        lastLoginAt: new Date('2026-08-01T00:00:00Z'),
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
      });

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.email).toBe('user@test.com');
          expect(res.body.data.organization.name).toBe('Test Org');
        });
    });

    it('GET /api/v1/users/me should reject unauthenticated request', () => {
      return request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });

    it('PATCH /api/v1/users/me should update profile fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        role: 'USER',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Senior Engineer',
        department: 'Eng',
        role: 'USER',
        isActive: true,
        lastLoginAt: null,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
      });

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ title: 'Senior Engineer', department: 'Eng' })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.title).toBe('Senior Engineer');
        });
    });

    it('GET /api/v1/users should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'user@test.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'USER',
          isActive: true,
        },
      ]);
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.meta.total).toBe(1);
          expect(res.body.data.data).toHaveLength(1);
        });
    });

    it('PATCH /api/v1/users/:id should update member role (admin only)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ role: 'VIEWER' })
        .expect(403);

      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'admin-1',
          email: 'admin@test.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'ADMIN',
          isActive: true,
          organizationId: 'org-1',
          organization: { id: 'org-1', name: 'Test Org' },
        })
        .mockResolvedValue({
          id: 'user-1',
          email: 'user@test.com',
          role: 'USER',
          isActive: true,
          organizationId: 'org-1',
          deletedAt: null,
        });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        role: 'VIEWER',
        isActive: true,
      });

      await request(app.getHttpServer())
        .patch('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'VIEWER' })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.role).toBe('VIEWER');
        });
    });
  });

  // ─── VIEWER role (read-only) ───────────────────────────────────

  describe('VIEWER role', () => {
    const setViewer = () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'viewer-1',
        email: 'viewer@test.com',
        firstName: 'Vera',
        lastName: 'Viewer',
        role: 'VIEWER',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
    };

    it('GET /documents should be allowed (read)', async () => {
      setViewer();
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.document.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('POST /documents should be forbidden (write)', async () => {
      setViewer();

      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: 'X', content: 'Y' })
        .expect(403);
    });

    it('GET /chat/conversations should be allowed (read)', async () => {
      setViewer();
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('POST /chat/messages should be forbidden (write)', async () => {
      setViewer();

      await request(app.getHttpServer())
        .post('/api/v1/chat/messages')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ content: 'hello' })
        .expect(403);
    });

    it('POST /upload should be forbidden (write)', async () => {
      setViewer();

      await request(app.getHttpServer())
        .post('/api/v1/upload')
        .set('Authorization', `Bearer ${viewerToken}`)
        .attach('file', Buffer.from('x'), 'x.txt')
        .expect(403);
    });

    it('GET /meetings should be allowed (read)', async () => {
      setViewer();
      mockPrisma.meeting.findMany.mockResolvedValue([]);
      mockPrisma.meeting.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/v1/meetings')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('POST /meetings should be forbidden (write)', async () => {
      setViewer();

      await request(app.getHttpServer())
        .post('/api/v1/meetings')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ title: 'X' })
        .expect(403);
    });

    it('GET /notifications should be allowed (read)', async () => {
      setViewer();
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('POST /notifications/:id/read should be forbidden (write)', async () => {
      setViewer();

      await request(app.getHttpServer())
        .post('/api/v1/notifications/n-1/read')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(403);
    });

    it('PATCH /users/me should be forbidden (write)', async () => {
      setViewer();

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ firstName: 'V' })
        .expect(403);
    });

    it('GET /search should be allowed (read)', async () => {
      setViewer();
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.chunk.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/search?q=test')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('GET /expertise/search should be allowed (read)', async () => {
      setViewer();
      mockPrisma.expertiseScore.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/expertise/search?q=test')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });

    it('GET /graph/nodes should be allowed (read)', async () => {
      setViewer();
      mockPrisma.document.findMany.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get('/api/v1/graph/nodes')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(200);
    });
  });

  // ─── Validation ────────────────────────────────────────────────

  describe('Validation', () => {
    it('should reject invalid login payload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'notanemail', password: 'short' })
        .expect(400);
    });

    it('should reject invalid register payload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'bad', password: 'short' })
        .expect(400);
    });
  });
});
