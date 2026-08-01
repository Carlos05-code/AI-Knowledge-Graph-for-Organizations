import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(organizationId: string) {
    const [
      totalDocuments,
      indexedDocuments,
      totalUsers,
      totalConnectors,
      totalMeetings,
      totalPolicies,
      recentActivity,
    ] = await Promise.all([
      this.prisma.document.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.document.count({ where: { organizationId, status: 'INDEXED', deletedAt: null } }),
      this.prisma.user.count({ where: { organizationId, isActive: true } }),
      this.prisma.connector.count({ where: { organizationId, deletedAt: null, isEnabled: true } }),
      this.prisma.meeting.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.policy.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { organization: false },
      }),
    ]);

    return {
      documents: { total: totalDocuments, indexed: indexedDocuments, pending: totalDocuments - indexedDocuments },
      users: { total: totalUsers },
      connectors: { active: totalConnectors },
      meetings: { total: totalMeetings },
      policies: { total: totalPolicies },
      recentActivity,
    };
  }

  async getAuditLogs(organizationId: string, params: { page: number; limit: number; entity?: string; action?: string }) {
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
      meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit), hasNext: params.page * params.limit < total, hasPrevious: params.page > 1 },
    };
  }

  async getSystemHealth() {
    return {
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };
  }
}
