import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Expertise + Gaps + Recommendations (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let mockPrisma: E2EContext['mockPrisma'];
  let validToken: string;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, mockPrisma, validToken } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);
  });

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
});
