import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: {
    title: string;
    description?: string;
    meetingDate: Date;
    duration?: number;
    transcript?: string;
    organizerId: string;
    organizationId: string;
    participantIds?: string[];
  }) {
    const meeting = await this.prisma.meeting.create({
      data: {
        title: data.title,
        description: data.description,
        meetingDate: data.meetingDate,
        duration: data.duration,
        transcript: data.transcript,
        organizerId: data.organizerId,
        organizationId: data.organizationId,
        participants: data.participantIds
          ? { create: data.participantIds.map((userId) => ({ userId })) }
          : undefined,
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return meeting;
  }

  async findAll(
    organizationId: string,
    params: { page: number; limit: number },
  ) {
    const where = { organizationId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: { meetingDate: 'desc' },
        include: {
          participants: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.meeting.count({ where }),
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
    return this.prisma.meeting.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                title: true,
              },
            },
          },
        },
      },
    });
  }

  async generateSummary(id: string, organizationId: string) {
    const meeting = await this.findById(id, organizationId);
    if (!meeting) throw new NotFoundException('Meeting not found');

    // In production, use LLM to generate summary from transcript
    const summary = `AI-generated summary for "${meeting.title}"`;
    const actionItems = ['Action item 1', 'Action item 2'];

    await this.prisma.meeting.update({
      where: { id },
      data: { summary, actionItems, decisions: [] },
    });

    return { summary, actionItems };
  }

  async delete(id: string, organizationId: string) {
    const existing = await this.prisma.meeting.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundException('Meeting not found');
    return this.prisma.meeting.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
