import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { QdrantService } from '../../infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    private prisma: PrismaService,
    private neo4j: Neo4jService,
    private qdrant: QdrantService,
    private embedding: EmbeddingService,
  ) {}

  async getRecommendations(userId: string, organizationId: string) {
    const [experts, documents, meetings, code] = await Promise.all([
      this.recommendExperts(userId, organizationId),
      this.recommendDocuments(userId, organizationId),
      this.recommendMeetings(userId, organizationId),
      this.recommendReusableCode(organizationId),
    ]);

    return {
      experts: experts.slice(0, 5),
      documents: documents.slice(0, 5),
      meetings: meetings.slice(0, 5),
      reusableCode: code.slice(0, 5),
    };
  }

  private async recommendExperts(userId: string, organizationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, title: true, department: true },
    });

    const similarRoleUsers = await this.prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        id: { not: userId },
        ...(user?.title ? { title: { contains: user.title.split(' ')[0], mode: 'insensitive' } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        expertiseScores: { select: { topic: true, score: true }, orderBy: { score: 'desc' }, take: 3 },
      },
      take: 10,
    });

    return similarRoleUsers.map((u) => ({
      user: { id: u.id, firstName: u.firstName, lastName: u.lastName, title: u.title },
      reason: 'Similar role and expertise area',
      topics: u.expertiseScores.map((e) => ({ topic: e.topic, score: e.score })),
    }));
  }

  private async recommendDocuments(userId: string, organizationId: string) {
    const userMessages = await this.prisma.message.findMany({
      where: { conversation: { userId }, role: 'USER' },
      select: { content: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const userInterests = userMessages.map((m) => m.content).join(' ');

    if (!userInterests) {
      return this.prisma.document.findMany({
        where: { organizationId, deletedAt: null, status: 'INDEXED' },
        select: { id: true, title: true, description: true, fileType: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    }

    try {
      const vector = await this.embedding.generateEmbedding(userInterests);
      const results = await this.qdrant.search('knowledge_chunks', vector, { limit: 10 });

      const docIds = [...new Set(results.map((r) => r.payload.documentId as string).filter(Boolean))];

      if (docIds.length > 0) {
        const docs = await this.prisma.document.findMany({
          where: { id: { in: docIds }, organizationId, deletedAt: null },
          select: { id: true, title: true, description: true, fileType: true },
        });
        return docs;
      }
    } catch {}

    return this.prisma.document.findMany({
      where: { organizationId, deletedAt: null, status: 'INDEXED' },
      select: { id: true, title: true, description: true, fileType: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  private async recommendMeetings(userId: string, organizationId: string) {
    const userMeetings = await this.prisma.meetingParticipant.findMany({
      where: { userId },
      select: { meetingId: true },
    });

    const userMeetingIds = userMeetings.map((m) => m.meetingId);

    const recentMeetings = await this.prisma.meeting.findMany({
      where: {
        organizationId,
        deletedAt: null,
        id: { notIn: userMeetingIds },
        meetingDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        title: true,
        summary: true,
        meetingDate: true,
        participants: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { meetingDate: 'desc' },
      take: 5,
    });

    return recentMeetings;
  }

  private async recommendReusableCode(organizationId: string) {
    try {
      const repos = await this.neo4j.executeRaw(
        `MATCH (r:Repository)
         WHERE r.organizationId = $orgId
         RETURN r.name as name, r.language as language, r.description as description
         ORDER BY r.stars DESC
         LIMIT 5`,
        { orgId: organizationId },
      );

      return repos.map((r: any) => ({
        name: r.name,
        language: r.language || 'Unknown',
        description: r.description || `Repository: ${r.name}`,
        type: 'repository',
      }));
    } catch {
      return [];
    }
  }

  async getPersonalizedFeed(userId: string, organizationId: string) {
    const [recentDocs, recentMeetings, recentNotifications, pendingGaps] = await Promise.all([
      this.prisma.document.findMany({
        where: { organizationId, deletedAt: null, status: 'INDEXED' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, createdAt: true, fileType: true },
      }),
      this.prisma.meeting.findMany({
        where: { organizationId, deletedAt: null, meetingDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        orderBy: { meetingDate: 'desc' },
        take: 3,
        select: { id: true, title: true, meetingDate: true },
      }),
      this.prisma.notification.findMany({
        where: { userId, isRead: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.knowledgeGap.findMany({
        where: { resolvedAt: null },
        orderBy: { severity: 'asc' },
        take: 3,
      }),
    ]);

    return {
      recentDocuments: recentDocs,
      upcomingMeetings: recentMeetings,
      unreadNotifications: recentNotifications,
      openKnowledgeGaps: pendingGaps,
    };
  }
}
