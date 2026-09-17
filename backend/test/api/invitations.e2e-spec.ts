import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Invitations (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let mockPrisma: E2EContext['mockPrisma'];
  let validToken: string;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, mockPrisma, validToken, adminToken } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);
  });

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
});
