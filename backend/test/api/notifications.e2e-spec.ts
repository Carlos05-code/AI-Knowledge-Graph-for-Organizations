import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Notifications (e2e)', () => {
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

    it('POST /api/v1/notifications/:id/read should mark own notification as read', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        isRead: false,
      });
      mockPrisma.notification.update.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
        isRead: true,
      });

      await request(app.getHttpServer())
        .post('/api/v1/notifications/notif-1/read')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(201);

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
      });
    });

    it('POST /api/v1/notifications/:id/read should 404 for another user notification', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/notifications/notif-9/read')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);
    });

    it('DELETE /api/v1/notifications/:id should delete own notification', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
      });
      mockPrisma.notification.delete.mockResolvedValue({
        id: 'notif-1',
        userId: 'user-1',
      });

      await request(app.getHttpServer())
        .delete('/api/v1/notifications/notif-1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId: 'user-1' },
      });
    });

    it('DELETE /api/v1/notifications/:id should 404 for another user notification', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await request(app.getHttpServer())
        .delete('/api/v1/notifications/notif-9')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);
    });
  });
});
