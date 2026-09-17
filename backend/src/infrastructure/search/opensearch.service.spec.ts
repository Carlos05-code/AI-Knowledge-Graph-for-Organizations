import { OpenSearchService } from './opensearch.service';

const mockClient = {
  indices: {
    exists: jest.fn(),
    create: jest.fn(),
  },
  bulk: jest.fn(),
  deleteByQuery: jest.fn(),
  search: jest.fn(),
};

jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn().mockImplementation(() => mockClient),
}));

describe('OpenSearchService', () => {
  let service: OpenSearchService;
  const config = { get: jest.fn((_key: string, def?: unknown) => def) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OpenSearchService(config as any);
  });

  it('is unavailable before onModuleInit runs', () => {
    expect(service.isAvailable()).toBe(false);
  });

  it('becomes available when the index already exists', async () => {
    mockClient.indices.exists.mockResolvedValue({ body: true });
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(true);
    expect(mockClient.indices.create).not.toHaveBeenCalled();
  });

  it('creates the index with a BM25-friendly mapping when missing', async () => {
    mockClient.indices.exists.mockResolvedValue({ body: false });
    mockClient.indices.create.mockResolvedValue({});
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(true);
    const [{ index, body }] = mockClient.indices.create.mock.calls[0];
    expect(index).toBe('knowledge_chunks');
    expect(body.mappings.properties).toMatchObject({
      documentId: { type: 'keyword' },
      organizationId: { type: 'keyword' },
      content: { type: 'text' },
    });
  });

  it('degrades gracefully (fail-soft) when OpenSearch is unreachable', async () => {
    mockClient.indices.exists.mockRejectedValue(
      new Error('connection refused'),
    );
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(false);
  });

  it('rejects search/index/delete calls while unavailable', async () => {
    await expect(service.search('q', 'org-1')).rejects.toThrow('not available');
    await expect(service.deleteByDocumentId('doc-1')).rejects.toThrow(
      'not available',
    );
    await expect(
      service.indexChunks([
        {
          id: 'c1',
          documentId: 'd1',
          organizationId: 'o1',
          title: 't',
          content: 'hello',
          index: 0,
        },
      ]),
    ).rejects.toThrow('not available');
  });

  describe('once available', () => {
    beforeEach(async () => {
      mockClient.indices.exists.mockResolvedValue({ body: true });
      await service.onModuleInit();
    });

    it('bulk-indexes chunks scoped to the index name', async () => {
      mockClient.bulk.mockResolvedValue({ body: { errors: false, items: [] } });
      await service.indexChunks([
        {
          id: 'c1',
          documentId: 'd1',
          organizationId: 'o1',
          title: 'Handbook',
          content: 'hello world',
          index: 0,
        },
      ]);

      expect(mockClient.bulk).toHaveBeenCalledTimes(1);
      const [{ body, refresh }] = mockClient.bulk.mock.calls[0];
      expect(refresh).toBe(true);
      expect(body[0]).toEqual({
        index: { _index: 'knowledge_chunks', _id: 'c1' },
      });
      expect(body[1]).toMatchObject({
        documentId: 'd1',
        organizationId: 'o1',
        title: 'Handbook',
        content: 'hello world',
        index: 0,
      });
    });

    it('no-ops on an empty chunk list', async () => {
      await service.indexChunks([]);
      expect(mockClient.bulk).not.toHaveBeenCalled();
    });

    it('deletes all chunks for a document', async () => {
      mockClient.deleteByQuery.mockResolvedValue({});
      await service.deleteByDocumentId('d1');
      expect(mockClient.deleteByQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'knowledge_chunks',
          body: { query: { term: { documentId: 'd1' } } },
        }),
      );
    });

    it('searches with a BM25 multi_match query filtered to the org', async () => {
      mockClient.search.mockResolvedValue({
        body: {
          hits: {
            hits: [
              {
                _id: 'c1',
                _score: 1.23,
                _source: { title: 'Handbook', content: 'hello world' },
              },
            ],
          },
        },
      });

      const results = await service.search('hello', 'o1', { limit: 5 });

      expect(results).toEqual([
        {
          id: 'c1',
          score: 1.23,
          source: { title: 'Handbook', content: 'hello world' },
        },
      ]);

      const [{ index, body }] = mockClient.search.mock.calls[0];
      expect(index).toBe('knowledge_chunks');
      expect(body.size).toBe(5);
      expect(body.query.bool.filter).toEqual([
        { term: { organizationId: 'o1' } },
      ]);
      expect(body.query.bool.must[0].multi_match.fields).toEqual([
        'title^2',
        'content',
      ]);
    });
  });
});
