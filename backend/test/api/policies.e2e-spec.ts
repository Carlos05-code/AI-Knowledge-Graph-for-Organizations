import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Policies (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let mockPrisma: E2EContext['mockPrisma'];
  let adminToken: string;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, mockPrisma, adminToken } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);
  });

  describe('Policies', () => {
    it('DELETE /api/v1/policies/:id should soft-delete a policy in own org (admin)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.policy.findFirst.mockResolvedValue({
        id: 'p-1',
        title: 'Travel policy',
        organizationId: 'org-1',
      });
      mockPrisma.policy.update.mockResolvedValue({
        id: 'p-1',
        deletedAt: new Date(),
        isActive: false,
      });

      await request(app.getHttpServer())
        .delete('/api/v1/policies/p-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(mockPrisma.policy.findFirst).toHaveBeenCalledWith({
        where: { id: 'p-1', organizationId: 'org-1' },
      });
    });

    it('DELETE /api/v1/policies/:id should 404 for a policy in another org', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        email: 'admin@test.com',
        firstName: 'Admin',
        lastName: 'User',
        role: 'ADMIN',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.policy.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/policies/p-9')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });
});
