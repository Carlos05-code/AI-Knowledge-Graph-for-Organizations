import { Test, TestingModule } from '@nestjs/testing';
import { ExpertiseService } from './expertise.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';

describe('ExpertiseService', () => {
  let service: ExpertiseService;

  const mockPrisma = {
    expertiseScore: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
  };

  const mockNeo4j = {
    executeRaw: jest.fn(),
    searchNodes: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpertiseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Neo4jService, useValue: mockNeo4j },
      ],
    }).compile();

    service = module.get<ExpertiseService>(ExpertiseService);
  });

  it('should find experts by topic', async () => {
    mockPrisma.expertiseScore.findMany.mockResolvedValue([
      {
        userId: 'user-1',
        score: 0.95,
        source: 'commits',
        topic: 'Kubernetes',
        user: { id: 'user-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com', title: 'ML Engineer', avatar: null },
      },
    ]);
    mockNeo4j.executeRaw.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result = await service.findExperts('Kubernetes', 'org-1', 10);
    expect(result).toHaveLength(1);
    expect(result[0].user.firstName).toBe('Jane');
    expect(result[0].score).toBe(0.95);
  });

  it('should return empty when no experts found', async () => {
    mockPrisma.expertiseScore.findMany.mockResolvedValue([]);
    mockNeo4j.executeRaw.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result = await service.findExperts('UnknownTopic', 'org-1', 10);
    expect(result).toHaveLength(0);
  });

  it('should get expertise summary', async () => {
    mockPrisma.expertiseScore.findMany.mockResolvedValue([
      { topic: 'Kubernetes', score: 0.95, user: { id: 'user-1', firstName: 'Jane', lastName: 'Doe' } },
      { topic: 'Kubernetes', score: 0.85, user: { id: 'user-2', firstName: 'John', lastName: 'Smith' } },
      { topic: 'React', score: 0.92, user: { id: 'user-1', firstName: 'Jane', lastName: 'Doe' } },
    ]);

    const result = await service.getExpertiseSummary('org-1');
    expect(result).toHaveLength(2);
    expect(result[0].topic).toBe('React');
    expect(result[0].averageScore).toBe(0.92);
    expect(result[0].expertCount).toBe(1);
    expect(result[1].topic).toBe('Kubernetes');
    expect(result[1].averageScore).toBeCloseTo(0.9, 2);
    expect(result[1].expertCount).toBe(2);
  });

  it('should fallback gracefully when graph query fails', async () => {
    mockPrisma.expertiseScore.findMany.mockResolvedValue([]);
    mockNeo4j.executeRaw.mockRejectedValue(new Error('Neo4j offline'));
    mockPrisma.document.findMany.mockResolvedValue([]);

    const result = await service.findExperts('Kubernetes', 'org-1', 10);
    expect(result).toHaveLength(0);
  });
});
