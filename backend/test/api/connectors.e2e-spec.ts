import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Connectors (e2e)', () => {
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
});
