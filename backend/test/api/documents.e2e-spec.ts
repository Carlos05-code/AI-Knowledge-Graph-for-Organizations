import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Documents (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let mockPrisma: E2EContext['mockPrisma'];
  let mockNeo4j: E2EContext['mockNeo4j'];
  let validToken: string;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, mockPrisma, mockNeo4j, validToken, adminToken } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);
  });

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

    it('DELETE /api/v1/documents/:id should 404 for a document in another org', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/documents/doc-9')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('POST /api/v1/documents/:id/process should 404 for a document in another org', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/documents/doc-9/process')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ─── Upload ────────────────────────────────────────────────────

  describe('Upload', () => {
    it('POST /api/v1/upload should require authentication', async () => {
      await request(app.getHttpServer()).post('/api/v1/upload').expect(401);
    });
  });
});
