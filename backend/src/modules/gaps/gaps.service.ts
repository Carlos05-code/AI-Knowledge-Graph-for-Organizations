import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';

@Injectable()
export class GapsService {
  private readonly logger = new Logger(GapsService.name);

  constructor(
    private prisma: PrismaService,
    private neo4j: Neo4jService,
  ) {}

  async detectGaps(organizationId: string) {
    const gaps = await Promise.all([
      this.detectUndocumentedServices(organizationId),
      this.detectStaleDocuments(organizationId),
      this.detectConflictingPolicies(organizationId),
      this.detectOrphanRepositories(organizationId),
      this.detectMissingOwnership(organizationId),
    ]);

    return gaps.flat();
  }

  private async detectUndocumentedServices(organizationId: string): Promise<any[]> {
    try {
      const services = await this.neo4j.executeRaw(
        `MATCH (s:Service)
         WHERE NOT EXISTS {
           MATCH (s)<-[:MENTIONS]-(d:Document)
         }
         RETURN s.name as serviceName, s.id as serviceId
         LIMIT 20`,
      );

      return services.map((s: any) => ({
        title: `Undocumented Service: ${s.serviceName}`,
        description: `The service "${s.serviceName}" exists in the knowledge graph but has no associated documentation.`,
        severity: 'HIGH',
        category: 'documentation',
        source: 'graph',
        entityId: s.serviceId,
      }));
    } catch {
      return [];
    }
  }

  private async detectStaleDocuments(organizationId: string): Promise<any[]> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    const staleDocs = await this.prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        updatedAt: { lt: sixMonthsAgo },
        status: 'INDEXED',
      },
      select: { id: true, title: true, updatedAt: true },
      take: 20,
    });

    return staleDocs.map((d) => ({
      title: `Stale Document: ${d.title}`,
      description: `Document "${d.title}" was last updated ${Math.floor((Date.now() - d.updatedAt.getTime()) / (1000 * 60 * 60 * 24))} days ago. Consider reviewing for accuracy.`,
      severity: 'MEDIUM',
      category: 'stale_content',
      source: 'database',
      entityId: d.id,
      lastUpdated: d.updatedAt,
    }));
  }

  private async detectConflictingPolicies(organizationId: string): Promise<any[]> {
    const policies = await this.prisma.policy.findMany({
      where: { organizationId, deletedAt: null, isActive: true },
      select: { id: true, title: true, content: true, category: true },
    });

    const conflicts: any[] = [];
    for (let i = 0; i < policies.length; i++) {
      for (let j = i + 1; j < policies.length; j++) {
        if (policies[i].category === policies[j].category) {
          conflicts.push({
            title: `Potential Policy Conflict: ${policies[i].title} vs ${policies[j].title}`,
            description: `Two active policies in the "${policies[i].category}" category may contain conflicting information.`,
            severity: 'MEDIUM',
            category: 'policy_conflict',
            source: 'database',
            entityIds: [policies[i].id, policies[j].id],
          });
        }
      }
    }

    return conflicts;
  }

  private async detectOrphanRepositories(organizationId: string): Promise<any[]> {
    try {
      const orphans = await this.neo4j.executeRaw(
        `MATCH (r:Repository)
         WHERE NOT EXISTS {
           MATCH (r)<-[:OWNS|CONTRIBUTES_TO]-(:Person)
         }
         RETURN r.name as repoName, r.id as repoId
         LIMIT 10`,
      );

      return orphans.map((r: any) => ({
        title: `Orphan Repository: ${r.repoName}`,
        description: `Repository "${r.repoName}" has no owner or contributors in the knowledge graph.`,
        severity: 'LOW',
        category: 'ownership',
        source: 'graph',
        entityId: r.repoId,
      }));
    } catch {
      return [];
    }
  }

  private async detectMissingOwnership(organizationId: string): Promise<any[]> {
    const unowned = await this.prisma.document.findMany({
      where: {
        organizationId,
        deletedAt: null,
        authorId: null,
        status: 'INDEXED',
      },
      select: { id: true, title: true },
      take: 20,
    });

    return unowned.map((d) => ({
      title: `Missing Owner: ${d.title}`,
      description: `Document "${d.title}" has no assigned author or owner.`,
      severity: 'LOW',
      category: 'ownership',
      source: 'database',
      entityId: d.id,
    }));
  }

  async getGaps(organizationId: string, params: { page: number; limit: number; severity?: string; category?: string; resolved?: boolean }) {
    const where: any = {};
    if (params.severity) where.severity = params.severity;
    if (params.category) where.category = params.category;
    if (params.resolved === false) where.resolvedAt = null;
    if (params.resolved === true) where.resolvedAt = { not: null };

    const [data, total] = await Promise.all([
      this.prisma.knowledgeGap.findMany({
        where,
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        orderBy: [
          { severity: 'asc' },
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.knowledgeGap.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: params.page, limit: params.limit, totalPages: Math.ceil(total / params.limit), hasNext: params.page * params.limit < total, hasPrevious: params.page > 1 },
    };
  }

  async resolveGap(id: string) {
    return this.prisma.knowledgeGap.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
  }
}
