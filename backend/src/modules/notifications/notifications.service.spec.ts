import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  const mockPrisma = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('getUnreadCount', () => {
    it('should query prisma on cache miss and populate the cache', async () => {
      mockCache.get.mockResolvedValue(null);
      mockPrisma.notification.count.mockResolvedValue(3);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(3);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
      expect(mockCache.set).toHaveBeenCalledWith(
        'notif:unread:user-1',
        3,
        15_000,
      );
    });

    it('should serve from cache without touching prisma', async () => {
      mockCache.get.mockResolvedValue(7);

      const result = await service.getUnreadCount('user-1');

      expect(result).toBe(7);
      expect(mockPrisma.notification.count).not.toHaveBeenCalled();
    });
  });

  it('create should invalidate the unread count cache', async () => {
    mockPrisma.notification.create.mockResolvedValue({ id: 'n-1' });

    await service.create({
      userId: 'user-1',
      type: 'DOCUMENT_CHANGED',
      title: 't',
      message: 'm',
    });

    expect(mockCache.del).toHaveBeenCalledWith('notif:unread:user-1');
  });

  it('markAsRead should invalidate the unread count cache', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({
      id: 'n-1',
      userId: 'user-1',
    });
    mockPrisma.notification.update.mockResolvedValue({
      id: 'n-1',
      isRead: true,
    });

    await service.markAsRead('n-1', 'user-1');

    expect(mockCache.del).toHaveBeenCalledWith('notif:unread:user-1');
  });

  it('markAllAsRead should invalidate the unread count cache', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 2 });

    await service.markAllAsRead('user-1');

    expect(mockCache.del).toHaveBeenCalledWith('notif:unread:user-1');
  });

  it('delete should invalidate the unread count cache', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue({
      id: 'n-1',
      userId: 'user-1',
    });
    mockPrisma.notification.delete.mockResolvedValue({ id: 'n-1' });

    await service.delete('n-1', 'user-1');

    expect(mockCache.del).toHaveBeenCalledWith('notif:unread:user-1');
  });

  it('markAsRead should 404 when the notification is not owned by the user', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);

    await expect(service.markAsRead('n-9', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.notification.update).not.toHaveBeenCalled();
  });

  it('delete should 404 when the notification is not owned by the user', async () => {
    mockPrisma.notification.findFirst.mockResolvedValue(null);

    await expect(service.delete('n-9', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.notification.delete).not.toHaveBeenCalled();
  });
});
