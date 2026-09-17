import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Meetings (e2e)', () => {
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

  describe('Meetings', () => {
    it('DELETE /api/v1/meetings/:id should soft-delete a meeting in own org', async () => {
      mockPrisma.meeting.findFirst.mockResolvedValue({
        id: 'm-1',
        title: 'Sprint planning',
        organizationId: 'org-1',
      });
      mockPrisma.meeting.update.mockResolvedValue({
        id: 'm-1',
        deletedAt: new Date(),
      });

      await request(app.getHttpServer())
        .delete('/api/v1/meetings/m-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(mockPrisma.meeting.findFirst).toHaveBeenCalledWith({
        where: { id: 'm-1', organizationId: 'org-1' },
      });
    });

    it('DELETE /api/v1/meetings/:id should 404 for a meeting in another org', async () => {
      mockPrisma.meeting.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/meetings/m-9')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);
    });
  });
});
