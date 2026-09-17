import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Admin + Users (e2e)', () => {
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

  describe('Admin', () => {
    it('GET /api/v1/admin/dashboard should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      mockPrisma.document.count.mockResolvedValue(10);
      mockPrisma.user.count.mockResolvedValue(5);
      mockPrisma.notification.count.mockResolvedValue(3);
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
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('POST /api/v1/admin/secrets/rotate-jwt should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/secrets/rotate-jwt')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);
    });

    it('POST /api/v1/admin/secrets/rotate-jwt rotates the JWT secret', async () => {
      mockPrisma.appSecret.findMany.mockResolvedValue([{ version: 1 }]);
      mockPrisma.appSecret.create.mockResolvedValue({ id: 'sec-2' });
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

      const response = await request(app.getHttpServer())
        .post('/api/v1/admin/secrets/rotate-jwt')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      const data = response.body.data;
      expect(data).toMatchObject({
        version: 2,
        rotatedAt: expect.any(String),
      });
      expect(data.secret).toMatch(/^[0-9a-f]{64}$/);
      expect(mockPrisma.appSecret.create).toHaveBeenCalled();
      const stored = mockPrisma.appSecret.create.mock.calls[0][0].data.value;
      expect(stored).not.toContain(data.secret);
      expect(stored.startsWith('akg:v')).toBe(true);
    });
  });

  // ─── Users ────────────────────────────────────────────────────

  describe('Users', () => {
    it('GET /api/v1/users/me should return current profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Engineer',
        department: 'Eng',
        role: 'USER',
        isActive: true,
        lastLoginAt: new Date('2026-08-01T00:00:00Z'),
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
      });

      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.email).toBe('user@test.com');
          expect(res.body.data.organization.name).toBe('Test Org');
        });
    });

    it('GET /api/v1/users/me should reject unauthenticated request', () => {
      return request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    });

    it('PATCH /api/v1/users/me should update profile fields', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        role: 'USER',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        title: 'Senior Engineer',
        department: 'Eng',
        role: 'USER',
        isActive: true,
        lastLoginAt: null,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org', slug: 'test-org' },
      });

      await request(app.getHttpServer())
        .patch('/api/v1/users/me')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ title: 'Senior Engineer', department: 'Eng' })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.title).toBe('Senior Engineer');
        });
    });

    it('GET /api/v1/users should require ADMIN role', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          email: 'user@test.com',
          firstName: 'John',
          lastName: 'Doe',
          role: 'USER',
          isActive: true,
        },
      ]);
      mockPrisma.user.count.mockResolvedValue(1);
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
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.meta.total).toBe(1);
          expect(res.body.data.data).toHaveLength(1);
        });
    });

    it('PATCH /api/v1/users/:id should update member role (admin only)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ role: 'VIEWER' })
        .expect(403);

      mockPrisma.user.findUnique
        .mockResolvedValueOnce({
          id: 'admin-1',
          email: 'admin@test.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'ADMIN',
          isActive: true,
          organizationId: 'org-1',
          organization: { id: 'org-1', name: 'Test Org' },
        })
        .mockResolvedValue({
          id: 'user-1',
          email: 'user@test.com',
          role: 'USER',
          isActive: true,
          organizationId: 'org-1',
          deletedAt: null,
        });
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        role: 'VIEWER',
        isActive: true,
      });

      await request(app.getHttpServer())
        .patch('/api/v1/users/user-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'VIEWER' })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.role).toBe('VIEWER');
        });
    });
  });
});
