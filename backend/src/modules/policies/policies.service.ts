import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class PoliciesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    title: string;
    content: string;
    category?: string;
    organizationId: string;
    workspaceId?: string;
    effectiveDate?: Date;
    expirationDate?: Date;
  }) {
    return this.prisma.policy.create({ data });
  }

  async findAll(
    organizationId: string,
    params: {
      page: number;
      limit: number;
      category?: string;
      active?: boolean;
    },
  ) {
    const where: any = { organizationId, deletedAt: null };
    if (params.category) where.category = params.category;
    if (params.active !== undefined) where.isActive = params.active;

    const [data, total] = await Promise.all([
      this.prisma.policy.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.policy.count({ where }),
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

  async findById(id: string, organizationId: string) {
    return this.prisma.policy.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        documents: {
          include: { document: { select: { id: true, title: true } } },
        },
      },
    });
  }

  async searchByQuery(query: string, organizationId: string) {
    return this.prisma.policy.findMany({
      where: {
        organizationId,
        deletedAt: null,
        isActive: true,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 10,
    });
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<{
      title: string;
      content: string;
      category: string;
      isActive: boolean;
      effectiveDate: Date;
      expirationDate: Date;
    }>,
  ) {
    const existing = await this.prisma.policy.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Policy not found');

    return this.prisma.policy.update({
      where: { id },
      data: {
        ...data,
        version: data.content ? existing.version + 1 : existing.version,
      },
    });
  }

  async delete(id: string, organizationId: string) {
    const existing = await this.prisma.policy.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Policy not found');
    return this.prisma.policy.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
