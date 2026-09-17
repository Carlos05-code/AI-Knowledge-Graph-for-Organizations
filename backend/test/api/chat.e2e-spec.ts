import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Chat (e2e)', () => {
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
});
