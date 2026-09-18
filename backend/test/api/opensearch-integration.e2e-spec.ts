import type { INestApplication } from '@nestjs/common';
import { OpenSearchService } from '../../src/infrastructure/search/opensearch.service';
import { bootstrapE2eApp, E2EContext } from '../support/e2e-app';

/**
 * Every other e2e spec mocks OpenSearchService (see e2e-app.ts) so tests
 * stay deterministic. This is the one suite that skips that override and
 * talks to a real cluster, closing the gap tracked in ROADMAP.md milestone
 * 14: OpenSearch had unit-test coverage via mocks only and had never been
 * exercised end-to-end. It only runs where a cluster is actually reachable
 * (CI provisions one as a service container) — locally, with no
 * OPENSEARCH_HOST configured, it skips rather than failing every run.
 */
const describeIfOpenSearch = process.env.OPENSEARCH_HOST
  ? describe
  : describe.skip;

describeIfOpenSearch('OpenSearch real-cluster integration (e2e)', () => {
  let ctx: E2EContext;
  let app: INestApplication;
  let opensearch: OpenSearchService;

  beforeAll(async () => {
    ctx = await bootstrapE2eApp({ realOpenSearch: true });
    ({ app } = ctx);
    opensearch = app.get(OpenSearchService);
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('connects to the real cluster and reports available', () => {
    expect(opensearch.isAvailable()).toBe(true);
  });

  it('indexes, searches (BM25, org-scoped), and deletes a chunk end-to-end', async () => {
    const organizationId = `org-e2e-${Date.now()}`;
    const documentId = `doc-e2e-${Date.now()}`;
    const chunkId = `chunk-e2e-${Date.now()}`;

    await opensearch.indexChunks([
      {
        id: chunkId,
        documentId,
        organizationId,
        title: 'Employee Onboarding Handbook',
        content: 'New hires must complete security training within 30 days.',
        index: 0,
      },
    ]);

    const hits = await opensearch.search('security training', organizationId);
    expect(hits).toEqual([
      expect.objectContaining({
        id: chunkId,
        source: expect.objectContaining({ documentId }),
      }),
    ]);

    const otherOrgHits = await opensearch.search(
      'security training',
      `${organizationId}-other`,
    );
    expect(otherOrgHits).toEqual([]);

    await opensearch.deleteByDocumentId(documentId);

    const afterDelete = await opensearch.search(
      'security training',
      organizationId,
    );
    expect(afterDelete).toEqual([]);
  });
});
