import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import {
  bootstrapE2eApp,
  resetE2eMockDefaults,
  E2EContext,
} from '../support/e2e-app';

describe('Auth (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let jwtService: JwtService;
  let mockPrisma: E2EContext['mockPrisma'];
  let validToken: string;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp();
    ({ app, jwtService, mockPrisma, validToken } = ctx);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetE2eMockDefaults(ctx);
  });

  describe('Auth', () => {
    const loginDto = { email: 'new@test.com', password: 'password123' };
    const registerDto = {
      email: 'new@test.com',
      firstName: 'John',
      lastName: 'Doe',
      password: 'password123',
    };

    it('POST /api/v1/auth/register should create user and return tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const org = { id: 'org-1', name: 'Test Org' };
      const user = {
        id: 'user-2',
        email: registerDto.email,
        firstName: registerDto.firstName,
        lastName: registerDto.lastName,
        role: 'USER',
      };

      mockPrisma.organization.create.mockResolvedValue(org);
      mockPrisma.user.create.mockResolvedValue(user);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(registerDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.data.accessToken).toBeDefined();
          expect(res.body.data.refreshToken).toBeDefined();
          expect(res.body.data.user.email).toBe(registerDto.email);
        });
    });

    it('POST /api/v1/auth/login should validate credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: '$2b$10$hashedpassword',
        role: 'USER',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(loginDto)
        .expect(200);
    });

    it('POST /api/v1/auth/login should reject invalid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'unknown@test.com', password: 'password123' })
        .expect(401);
    });

    it('POST /api/v1/auth/refresh should rotate the refresh token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'rt-old',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      mockPrisma.refreshToken.update.mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        isActive: true,
        organizationId: 'org-1',
      });
      mockPrisma.refreshToken.create.mockResolvedValue({ token: 'rt-new' });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'st-old' })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.refreshToken).toBeDefined();
        });
    });

    it('POST /api/v1/auth/refresh should reject a revoked token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: 'rt-revoked',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'rt-revoked' })
        .expect(401);
    });

    it('POST /api/v1/auth/logout should revoke a refresh token', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: 'st-old' })
        .expect(200);
    });
  });

  // ─── Auth token edge cases (security) ───────────────────────────

  describe('Auth token edge cases', () => {
    it('should reject an expired access token', async () => {
      const expiredToken = jwtService.sign(
        {
          sub: 'user-1',
          email: 'user@test.com',
          orgId: 'org-1',
          role: 'USER',
        },
        { expiresIn: '-60s' },
      );

      await request(app.getHttpServer())
        .get('/api/v1/meetings')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
    });

    it('should reject a tampered access token (wrong signature)', async () => {
      const tamperedToken = jwtService.sign(
        {
          sub: 'user-1',
          email: 'user@test.com',
          orgId: 'org-1',
          role: 'ADMIN',
        },
        { secret: 'attacker-secret' },
      );

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${tamperedToken}`)
        .expect(401);
    });

    it('should reject a token for a non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/meetings')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(401);
    });

    it('should reject a token for an inactive user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'user@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'USER',
        isActive: false,
        organizationId: 'org-1',
        organization: { id: 'org-1', name: 'Test Org' },
      });

      await request(app.getHttpServer())
        .get('/api/v1/meetings')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(401);
    });

    it('should take role/org from the DB, not token claims (privilege escalation)', async () => {
      const forgedToken = jwtService.sign({
        sub: 'user-1',
        email: 'user@test.com',
        orgId: 'org-2',
        role: 'ADMIN',
      });

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${forgedToken}`)
        .expect(403);
    });

    it('should reject requests with no Authorization header', async () => {
      await request(app.getHttpServer()).get('/api/v1/meetings').expect(401);
    });
  });

  // ─── Validation ────────────────────────────────────────────────

  describe('Validation', () => {
    it('should reject invalid login payload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'notanemail', password: 'short' })
        .expect(400);
    });

    it('should reject invalid register payload', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'bad', password: 'short' })
        .expect(400);
    });
  });
});
