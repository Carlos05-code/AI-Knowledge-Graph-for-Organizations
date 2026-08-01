import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';

@Injectable()
export class ExpertiseService {
  private readonly logger = new Logger(ExpertiseService.name);

  constructor(
    private prisma: PrismaService,
    private neo4j: Neo4jService,
  ) {}

  async findExperts(topic: string, organizationId: string, limit = 10) {
    const [scores, graphResults, documentAuthors] = await Promise.all([
      this.getScoresByTopic(topic, organizationId, limit),
      this.getGraphExperts(topic, limit),
      this.getDocumentAuthors(topic, organizationId, limit),
    ]);

    const combined = this.mergeAndRank([...scores, ...graphResults, ...documentAuthors]);
    return combined.slice(0, limit);
  }

  private async getScoresByTopic(topic: string, organizationId: string, limit: number) {
    const scores = await this.prisma.expertiseScore.findMany({
      where: {
        topic: { contains: topic, mode: 'insensitive' },
        user: { organizationId, isActive: true },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, title: true, avatar: true } },
      },
      orderBy: { score: 'desc' },
      take: limit,
    });

    return scores.map((s) => ({
      user: s.user,
      score: s.score,
      source: s.source,
      topic: s.topic,
      evidence: [`Expertise score: ${(s.score * 100).toFixed(0)}%`],
    }));
  }

  private async getGraphExperts(topic: string, limit: number) {
    try {
      const results = await this.neo4j.executeRaw(
        `MATCH (p:Person)
         WHERE toLower(p.name) CONTAINS toLower($topic)
         OR toLower(p.expertise) CONTAINS toLower($topic)
         OPTIONAL MATCH (p)-[:KNOWS|WORKS_ON|CONTRIBUTES_TO]-(related)
         RETURN p as person, count(related) as connections
         ORDER BY connections DESC
         LIMIT $limit`,
        { topic, limit },
      );

      return results.map((r: any) => ({
        user: {
          id: r.person.properties.id,
          firstName: r.person.properties.name?.split(' ')[0] || '',
          lastName: r.person.properties.name?.split(' ').slice(1).join(' ') || '',
          email: r.person.properties.email || '',
          title: r.person.properties.title || '',
        },
        score: Math.min(0.5 + (r.connections || 0) * 0.05, 0.95),
        source: 'graph',
        topic,
        evidence: [`Connected to ${r.connections || 0} relevant entities in the knowledge graph`],
      }));
    } catch {
      return [];
    }
  }

  private async getDocumentAuthors(topic: string, organizationId: string, limit: number) {
    const docs = await this.prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: 'INDEXED',
        OR: [
          { title: { contains: topic, mode: 'insensitive' } },
          { description: { contains: topic, mode: 'insensitive' } },
        ],
        authorId: { not: null },
      },
      select: {
        authorId: true,
        author: { select: { id: true, firstName: true, lastName: true, email: true, title: true } },
        title: true,
      },
      take: limit,
    });

    const authorMap = new Map<string, { user: any; count: number; docs: string[] }>();
    for (const doc of docs) {
      if (!doc.authorId || !doc.author) continue;
      const existing = authorMap.get(doc.authorId) || { user: doc.author, count: 0, docs: [] };
      existing.count++;
      existing.docs.push(doc.title);
      authorMap.set(doc.authorId, existing);
    }

    return Array.from(authorMap.values()).map((entry) => ({
      user: entry.user,
      score: Math.min(0.3 + entry.count * 0.1, 0.8),
      source: 'documents',
      topic,
      evidence: [`Authored ${entry.count} document(s) about this topic`, ...entry.docs.map((d) => `- ${d}`)],
    }));
  }

  private mergeAndRank(results: any[]): any[] {
    const userMap = new Map<string, any>();

    for (const r of results) {
      const id = r.user?.id;
      if (!id) continue;
      if (userMap.has(id)) {
        const existing = userMap.get(id)!;
        existing.score = Math.max(existing.score, r.score);
        existing.sources = [...new Set([...existing.sources, r.source])];
        existing.evidence = [...existing.evidence, ...r.evidence];
      } else {
        userMap.set(id, { ...r, sources: [r.source] });
      }
    }

    return Array.from(userMap.values()).sort((a, b) => b.score - a.score);
  }

  async getExpertiseSummary(organizationId: string) {
    const scores = await this.prisma.expertiseScore.findMany({
      where: { user: { organizationId, isActive: true } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { score: 'desc' },
    });

    const topicSummary = new Map<string, { totalScore: number; count: number; topExperts: any[] }>();
    for (const s of scores) {
      if (!topicSummary.has(s.topic)) {
        topicSummary.set(s.topic, { totalScore: 0, count: 0, topExperts: [] });
      }
      const entry = topicSummary.get(s.topic)!;
      entry.totalScore += s.score;
      entry.count++;
      if (entry.topExperts.length < 3) {
        entry.topExperts.push({ name: `${s.user.firstName} ${s.user.lastName}`, score: s.score });
      }
    }

    return Array.from(topicSummary.entries())
      .map(([topic, data]) => ({
        topic,
        averageScore: data.count > 0 ? data.totalScore / data.count : 0,
        expertCount: data.count,
        topExperts: data.topExperts,
      }))
      .sort((a, b) => b.averageScore - a.averageScore);
  }
}
