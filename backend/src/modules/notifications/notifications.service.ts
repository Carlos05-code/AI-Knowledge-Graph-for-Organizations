import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

const UNREAD_COUNT_TTL_MS = 15_000;

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  private unreadKey(userId: string) {
    return `notif:unread:${userId}`;
  }

  async create(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type as any,
        title: data.title,
        message: data.message,
        data: data.data as Prisma.InputJsonValue,
      },
    });
    await this.cache.del(this.unreadKey(data.userId));
    return notification;
  }

  async findAll(
    userId: string,
    params: { page: number; limit: number; unreadOnly?: boolean },
  ) {
    const where: any = { userId };
    if (params.unreadOnly) where.isRead = false;

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: params.page,
        limit: params.limit,
        totalPages: Math.ceil(total / params.limit),
        hasNext: params.page * params.limit < total,
        hasPrevious: params.page > 1,
      },
    };
  }

  async markAsRead(id: string, userId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    await this.cache.del(this.unreadKey(userId));
    return updated;
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    await this.cache.del(this.unreadKey(userId));
    return result;
  }

  async getUnreadCount(userId: string) {
    const cached = await this.cache.get<number>(this.unreadKey(userId));
    if (cached !== null) return cached;
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    await this.cache.set(this.unreadKey(userId), count, UNREAD_COUNT_TTL_MS);
    return count;
  }

  async delete(id: string, userId: string) {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) throw new NotFoundException('Notification not found');
    const deleted = await this.prisma.notification.delete({
      where: { id },
    });
    await this.cache.del(this.unreadKey(userId));
    return deleted;
  }
}
