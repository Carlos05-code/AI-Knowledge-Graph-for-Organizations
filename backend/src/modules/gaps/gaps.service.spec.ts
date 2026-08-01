import { Test, TestingModule } from '@nestjs/testing';
import { GapsService } from './gaps.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';

describe('GapsService', () => {
  let service: GapsService;

  const mockPrisma = {
    knowledgeGap: {
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
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

  it('should list knowledge gaps with pagination', async () => {
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

  it('should return empty gaps list', async () => {
    mockPrisma.knowledgeGap.findMany.mockResolvedValue([]);
    mockPrisma.knowledgeGap.count.mockResolvedValue(0);

    const result = await service.getGaps('org-1', { page: 1, limit: 20 });
    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it('should resolve a gap', async () => {
    const resolved = { id: 'gap-1', resolvedAt: new Date() };
    mockPrisma.knowledgeGap.update.mockResolvedValue(resolved);

    const result = await service.resolveGap('gap-1');
    expect(result.resolvedAt).toBeDefined();
    expect(mockPrisma.knowledgeGap.update).toHaveBeenCalledWith({
      where: { id: 'gap-1' },
      data: { resolvedAt: expect.any(Date) },
    });
  });

  it('should detect gaps from graph and database', async () => {
    mockNeo4j.executeRaw.mockResolvedValue([]);
    mockPrisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.policy.findMany.mockResolvedValue([]);

    const result = await service.detectGaps('org-1');
    expect(Array.isArray(result)).toBe(true);
  });

  it('should detect stale documents as gaps', async () => {
    mockNeo4j.executeRaw.mockResolvedValue([]);
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    mockPrisma.document.findMany
      .mockResolvedValueOnce([
        { id: 'doc-1', title: 'Old Doc', updatedAt: oldDate },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.policy.findMany.mockResolvedValue([]);

    const result = await service.detectGaps('org-1');
    expect(result.some((g: any) => g.title.includes('Stale'))).toBe(true);
  });

  it('should handle graph query failure gracefully', async () => {
    mockNeo4j.executeRaw.mockRejectedValue(new Error('Neo4j offline'));
    mockPrisma.document.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mockPrisma.policy.findMany.mockResolvedValue([]);

    const result = await service.detectGaps('org-1');
    expect(Array.isArray(result)).toBe(true);
  });
});
