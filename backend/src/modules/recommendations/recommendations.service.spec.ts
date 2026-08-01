import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsService } from './recommendations.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { Neo4jService } from '../../infrastructure/graph/neo4j.service';
import { QdrantService } from '../../infrastructure/vector/qdrant.service';
import { EmbeddingService } from '../../infrastructure/ai/embedding.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;

  const mockPrisma = {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    document: { findMany: jest.fn() },
    message: { findMany: jest.fn() },
    meeting: { findMany: jest.fn() },
    meetingParticipant: { findMany: jest.fn() },
    notification: { findMany: jest.fn() },
    knowledgeGap: { findMany: jest.fn() },
  };

  const mockNeo4j = { executeRaw: jest.fn() };
  const mockQdrant = { search: jest.fn() };
  const mockEmbedding = {
    generateEmbedding: jest.fn().mockResolvedValue(Array(1536).fill(0.1)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: Neo4jService, useValue: mockNeo4j },
        { provide: QdrantService, useValue: mockQdrant },
        { provide: EmbeddingService, useValue: mockEmbedding },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
  });

  it('should get recommendations', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      title: 'Engineer',
      department: 'Engineering',
    });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.meetingParticipant.findMany.mockResolvedValue([]);
    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockNeo4j.executeRaw.mockResolvedValue([]);

    const result = await service.getRecommendations('user-1', 'org-1');
    expect(result).toBeDefined();
    expect(result.experts).toBeDefined();
    expect(result.documents).toBeDefined();
    expect(result.meetings).toBeDefined();
    expect(result.reusableCode).toBeDefined();
  });

  it('should recommend experts with similar roles', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      title: 'Frontend Engineer',
      department: 'Engineering',
    });
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'user-2',
        firstName: 'Jane',
        lastName: 'Doe',
        title: 'Frontend Lead',
        expertiseScores: [{ topic: 'React', score: 0.92 }],
      },
    ]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.meetingParticipant.findMany.mockResolvedValue([]);
    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockNeo4j.executeRaw.mockResolvedValue([]);

    const result = await service.getRecommendations('user-1', 'org-1');
    expect(result.experts).toHaveLength(1);
    expect(result.experts[0].user.firstName).toBe('Jane');
  });

  it('should recommend documents based on user messages', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      title: 'Engineer',
      department: 'Engineering',
    });
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([
      { content: 'How do I deploy the payment API?' },
    ]);
    mockQdrant.search.mockResolvedValue([
      { id: 'chunk-1', score: 0.95, payload: { documentId: 'doc-1' } },
    ]);
    mockPrisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Payment API Docs',
        description: 'Guide',
        fileType: 'md',
      },
    ]);
    mockPrisma.meetingParticipant.findMany.mockResolvedValue([]);
    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockNeo4j.executeRaw.mockResolvedValue([]);

    const result = await service.getRecommendations('user-1', 'org-1');
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].title).toBe('Payment API Docs');
  });

  it('should get personalized feed', async () => {
    mockPrisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Recent Doc',
        createdAt: new Date(),
        fileType: 'pdf',
      },
    ]);
    mockPrisma.meeting.findMany.mockResolvedValue([
      { id: 'mtg-1', title: 'Sprint Review', meetingDate: new Date() },
    ]);
    mockPrisma.notification.findMany.mockResolvedValue([
      {
        id: 'notif-1',
        title: 'Doc processed',
        message: 'Ready',
        isRead: false,
        createdAt: new Date(),
      },
    ]);
    mockPrisma.knowledgeGap.findMany.mockResolvedValue([
      {
        id: 'gap-1',
        title: 'Missing docs',
        severity: 'HIGH',
        resolvedAt: null,
        createdAt: new Date(),
      },
    ]);

    const result = await service.getPersonalizedFeed('user-1', 'org-1');
    expect(result.recentDocuments).toHaveLength(1);
    expect(result.upcomingMeetings).toHaveLength(1);
    expect(result.unreadNotifications).toHaveLength(1);
    expect(result.openKnowledgeGaps).toHaveLength(1);
  });

  it('should handle missing user gracefully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.meetingParticipant.findMany.mockResolvedValue([]);
    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockNeo4j.executeRaw.mockResolvedValue([]);

    const result = await service.getRecommendations('user-1', 'org-1');
    expect(result.experts).toHaveLength(0);
  });
});
