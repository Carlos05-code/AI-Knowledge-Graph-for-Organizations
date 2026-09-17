import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('VIEWER role (read-only) (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let mockPrisma: E2EContext['mockPrisma'];
  let viewerToken: string;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, mockPrisma, viewerToken } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);
  });

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
});
