import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Search + Graph (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let mockPrisma: E2EContext['mockPrisma'];
  let mockNeo4j: E2EContext['mockNeo4j'];
  let mockQdrant: E2EContext['mockQdrant'];
  let validToken: string;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, mockPrisma, mockNeo4j, mockQdrant, validToken, adminToken } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);
  });

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
});
