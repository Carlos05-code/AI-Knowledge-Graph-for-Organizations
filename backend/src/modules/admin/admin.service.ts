import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CacheService } from '../../infrastructure/cache/cache.service';

const DASHBOARD_STATS_TTL_MS = 60_000;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  async getDashboardStats(organizationId: string) {
    const key = `admin:stats:${organizationId}`;
    const cached = await this.cache.get<object>(key);
    if (cached !== null) return cached;

    const [
      totalDocuments,
      indexedDocuments,
      totalUsers,
      totalConnectors,
      totalMeetings,
      totalPolicies,
      recentActivity,
    ] = await Promise.all([
      this.prisma.document.count({
        where: { organizationId, deletedAt: null },
      }),
      this.prisma.document.count({
        where: { organizationId, status: 'INDEXED', deletedAt: null },
      }),
      this.prisma.user.count({ where: { organizationId, isActive: true } }),
      this.prisma.connector.count({
        where: { organizationId, deletedAt: null, isEnabled: true },
      }),
      this.prisma.meeting.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.policy.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const stats = {
      documents: {
        total: totalDocuments,
        indexed: indexedDocuments,
        pending: totalDocuments - indexedDocuments,
      },
      users: { total: totalUsers },
      connectors: { active: totalConnectors },
      meetings: { total: totalMeetings },
      policies: { total: totalPolicies },
      recentActivity,
    };
    await this.cache.set(key, stats, DASHBOARD_STATS_TTL_MS);
    return stats;
  }
  async getAuditLogs(
    organizationId: string,
    params: { page: number; limit: number; entity?: string; action?: string },
  ) {
    const where: any = { organizationId };
    if (params.entity) where.entity = params.entity;
    if (params.action) where.action = params.action;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
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

  getSystemHealth() {
    return Promise.resolve({
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  }
}
