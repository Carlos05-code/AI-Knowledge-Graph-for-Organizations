import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { UserRole } from '../../domain/entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;

  const user = {
    id: 'u1',
    email: 'jane@acme.com',
    firstName: 'Jane',
    lastName: 'Doe',
    title: 'Engineer',
    department: 'Eng',
    role: UserRole.USER,
    isActive: true,
    lastLoginAt: new Date('2026-08-01T00:00:00Z'),
    organizationId: 'org1',
    deletedAt: null,
    organization: { id: 'org1', name: 'Acme', slug: 'acme' },
  };

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('getProfile', () => {
    it('returns the profile when the user is active', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...user,
        deletedAt: null,
      });

      const result = await service.getProfile('u1');

      expect(result).toEqual({
        id: 'u1',
        email: 'jane@acme.com',
        firstName: 'Jane',
        lastName: 'Doe',
        title: 'Engineer',
        department: 'Eng',
        role: UserRole.USER,
        isActive: true,
        lastLoginAt: user.lastLoginAt,
        organizationId: 'org1',
        organization: { id: 'org1', name: 'Acme', slug: 'acme' },
      });
    });

    it('throws NotFoundException when user is inactive or missing', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateProfile', () => {
    it('updates and returns the sanitized profile', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.user.update.mockResolvedValue({
        ...user,
        title: 'Senior Engineer',
      });

      const result = await service.updateProfile('u1', {
        title: 'Senior Engineer',
      });

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { title: 'Senior Engineer' },
        include: { organization: true },
      });
      expect(result.title).toBe('Senior Engineer');
    });
  });

  describe('findMembers', () => {
    it('paginates members and filters by query', async () => {
      prismaMock.user.findMany.mockResolvedValue([user]);
      prismaMock.user.count.mockResolvedValue(1);

      const result = await service.findMembers('org1', {
        page: 2,
        limit: 5,
        query: 'jane',
      });

      expect(result.meta).toEqual({
        total: 1,
        page: 2,
        limit: 5,
        totalPages: 1,
        hasNext: false,
        hasPrevious: true,
      });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org1',
            deletedAt: null,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            OR: expect.any(Array),
          }),
          skip: 5,
          take: 5,
        }),
      );
    });

    it('caps limit at maxLimit', async () => {
      prismaMock.user.findMany.mockResolvedValue([]);
      prismaMock.user.count.mockResolvedValue(0);

      await service.findMembers('org1', { limit: 5000 });

      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('updateMember', () => {
    it('rejects self-demotion or self-deactivation', async () => {
      await expect(
        service.updateMember('org1', 'u1', { role: UserRole.USER }, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects updating a member from another organization', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        ...user,
        organizationId: 'other-org',
      });

      await expect(
        service.updateMember('org1', 'u2', { isActive: false }, 'admin1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates role and status for a member', async () => {
      prismaMock.user.findUnique.mockResolvedValue(user);
      prismaMock.user.update.mockResolvedValue({
        ...user,
        role: UserRole.VIEWER,
        isActive: true,
      });

      const result = await service.updateMember(
        'org1',
        'u1',
        { role: UserRole.VIEWER },
        'admin1',
      );

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: UserRole.VIEWER },
      });
      expect(result.role).toBe(UserRole.VIEWER);
    });
  });
});
