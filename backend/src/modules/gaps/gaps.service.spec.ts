import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { GapsService } from './gaps.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';

describe('GapsService', () => {
  let service: GapsService;

  const mockPrisma = {
    knowledgeGap: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
    policy: {
      findMany: jest.fn(),
    },
  };

  const mockNeo4j = {
    executeRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GapsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Neo4jService, useValue: mockNeo4j },
      ],
    }).compile();

    service = module.get<GapsService>(GapsService);
  });

  describe('getGaps', () => {
    it('scopes the list to the caller organization', async () => {
      mockPrisma.knowledgeGap.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeGap.count.mockResolvedValue(0);

      await service.getGaps('org-1', { page: 1, limit: 20 });

      expect(mockPrisma.knowledgeGap.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
      expect(mockPrisma.knowledgeGap.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1' }),
        }),
      );
    });

    it('lists knowledge gaps with pagination', async () => {
      mockPrisma.knowledgeGap.findMany.mockResolvedValue([
        {
          id: 'gap-1',
          title: 'Undocumented API',
          description: 'Missing docs',
          severity: 'HIGH',
          category: 'documentation',
          resolvedAt: null,
          createdAt: new Date(),
        },
      ]);
      mockPrisma.knowledgeGap.count.mockResolvedValue(1);

      const result = await service.getGaps('org-1', { page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('resolveGap', () => {
    it('throws 404 for a gap outside the caller organization', async () => {
      mockPrisma.knowledgeGap.findFirst.mockResolvedValue(null);

      await expect(service.resolveGap('gap-1', 'org-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.knowledgeGap.update).not.toHaveBeenCalled();
    });

    it('resolves a gap that belongs to the caller organization', async () => {
      mockPrisma.knowledgeGap.findFirst.mockResolvedValue({
        id: 'gap-1',
        organizationId: 'org-1',
      });
      const resolved = { id: 'gap-1', resolvedAt: new Date() };
      mockPrisma.knowledgeGap.update.mockResolvedValue(resolved);

      const result = await service.resolveGap('gap-1', 'org-1');

      expect(mockPrisma.knowledgeGap.findFirst).toHaveBeenCalledWith({
        where: { id: 'gap-1', organizationId: 'org-1' },
      });
      expect(result.resolvedAt).toBeDefined();
      expect(mockPrisma.knowledgeGap.update).toHaveBeenCalledWith({
        where: { id: 'gap-1' },
        data: { resolvedAt: expect.any(Date) },
      });
    });
  });

  describe('detectGaps', () => {
    it('persists each detected gap, scoped to the organization', async () => {
      mockNeo4j.executeRaw.mockResolvedValue([]);
      const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
      mockPrisma.document.findMany
        .mockResolvedValueOnce([
          { id: 'doc-1', title: 'Old Doc', updatedAt: oldDate },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeGap.upsert.mockResolvedValue({});

      const result = await service.detectGaps('org-1');

      expect(Array.isArray(result)).toBe(true);
      expect(mockPrisma.knowledgeGap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_category_entityKey: {
              organizationId: 'org-1',
              category: 'stale_content',
              entityKey: 'doc-1',
            },
          },
          create: expect.objectContaining({
            organizationId: 'org-1',
            entityKey: 'doc-1',
          }),
        }),
      );
    });

    it('re-running detection upserts (not un-resolved) instead of duplicating', async () => {
      mockNeo4j.executeRaw.mockResolvedValue([]);
      mockPrisma.document.findMany
        .mockResolvedValueOnce([
          { id: 'doc-1', title: 'Old Doc', updatedAt: new Date(0) },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);
      mockPrisma.knowledgeGap.upsert.mockResolvedValue({});

      await service.detectGaps('org-1');

      const [{ update }] = mockPrisma.knowledgeGap.upsert.mock.calls[0];
      expect(update).not.toHaveProperty('resolvedAt');
    });

    it('derives a stable entityKey from sorted entityIds for multi-entity findings', async () => {
      mockNeo4j.executeRaw.mockResolvedValue([]);
      mockPrisma.document.findMany.mockResolvedValue([]);
      mockPrisma.policy.findMany.mockResolvedValue([
        { id: 'pol-b', title: 'B', content: '', category: 'security' },
        { id: 'pol-a', title: 'A', content: '', category: 'security' },
      ]);
      mockPrisma.knowledgeGap.upsert.mockResolvedValue({});

      await service.detectGaps('org-1');

      const conflictCall = mockPrisma.knowledgeGap.upsert.mock.calls.find(
        (c: any[]) =>
          c[0].where.organizationId_category_entityKey.category ===
          'policy_conflict',
      );
      expect(
        conflictCall[0].where.organizationId_category_entityKey.entityKey,
      ).toBe('pol-a,pol-b');
    });

    it('handles graph query failure gracefully', async () => {
      mockNeo4j.executeRaw.mockRejectedValue(new Error('Neo4j offline'));
      mockPrisma.document.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.policy.findMany.mockResolvedValue([]);

      const result = await service.detectGaps('org-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
