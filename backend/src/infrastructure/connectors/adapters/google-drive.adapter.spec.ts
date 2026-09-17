import { GoogleDriveAdapter } from './google-drive.adapter';

const mockDrive = {
  files: {
    list: jest.fn(),
    get: jest.fn(),
    export: jest.fn(),
  },
};

const mockOAuth2Instance = {
  setCredentials: jest.fn(),
  refreshAccessToken: jest.fn(),
};

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn().mockImplementation(() => mockOAuth2Instance) },
    drive: jest.fn().mockImplementation(() => mockDrive),
  },
}));

describe('GoogleDriveAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeAdapter = (overrides: Record<string, unknown> = {}) =>
    new GoogleDriveAdapter({
      clientId: 'id',
      clientSecret: 'secret',
      accessToken: 'token',
      refreshToken: 'refresh',
      ...overrides,
    });

  it('authenticates by constructing an OAuth2 client with credentials', async () => {
    await makeAdapter().authenticate();
    expect(mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({
      access_token: 'token',
      refresh_token: 'refresh',
    });
  });

  it('lists non-trashed files', async () => {
    mockDrive.files.list.mockResolvedValue({
      data: {
        files: [
          { id: 'f1', name: 'Handbook.pdf', mimeType: 'application/pdf' },
        ],
      },
    });
    const files = await makeAdapter().listFiles();
    expect(files).toEqual([
      expect.objectContaining({ id: 'f1', name: 'Handbook.pdf' }),
    ]);
    expect(mockDrive.files.list.mock.calls[0][0].q).toBe('trashed = false');
  });

  it('downloads raw bytes for a regular file', async () => {
    mockDrive.files.get.mockResolvedValue({
      data: Buffer.from('hello world'),
    });
    const buffer = await makeAdapter().downloadFile('f1');
    expect(buffer.toString('utf-8')).toBe('hello world');
  });

  describe('syncAll', () => {
    it('exports Google-native Docs to plain text instead of raw bytes', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [
            {
              id: 'doc1',
              name: 'Handbook',
              mimeType: 'application/vnd.google-apps.document',
            },
          ],
        },
      });
      mockDrive.files.export.mockResolvedValue({
        data: Buffer.from('Onboarding steps go here.'),
      });

      const result = await makeAdapter().syncAll();

      expect(mockDrive.files.export).toHaveBeenCalledWith(
        { fileId: 'doc1', mimeType: 'text/plain' },
        { responseType: 'arraybuffer' },
      );
      expect(result.documentsSynced).toBe(1);
      expect(result.documents?.[0]).toEqual(
        expect.objectContaining({
          id: 'doc1',
          content: 'Onboarding steps go here.',
          fileType: 'txt',
        }),
      );
    });

    it('downloads regular files directly without exporting', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [{ id: 'f1', name: 'notes.md', mimeType: 'text/markdown' }],
        },
      });
      mockDrive.files.get.mockResolvedValue({
        data: Buffer.from('# Notes'),
      });

      const result = await makeAdapter().syncAll();

      expect(mockDrive.files.export).not.toHaveBeenCalled();
      expect(result.documentsSynced).toBe(1);
      expect(result.documents?.[0]).toEqual(
        expect.objectContaining({ id: 'f1', content: '# Notes' }),
      );
    });

    it('skips folders, binary files, and non-exportable native types', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [
            {
              id: 'folder1',
              name: 'Docs',
              mimeType: 'application/vnd.google-apps.folder',
            },
            {
              id: 'form1',
              name: 'Survey',
              mimeType: 'application/vnd.google-apps.form',
            },
            { id: 'img1', name: 'logo.png', mimeType: 'image/png' },
          ],
        },
      });
      mockDrive.files.get.mockResolvedValue({
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]),
      });

      const result = await makeAdapter().syncAll();

      expect(mockDrive.files.export).not.toHaveBeenCalled();
      expect(result.documentsSynced).toBe(0);
      expect(result.metadata.skipped).toBe(2); // form1 (no export target) + img1 (binary)
      expect(result.metadata.filesFound).toBe(2); // folder already filtered out before this count
    });

    it('records a per-file error without aborting the rest of the sync', async () => {
      mockDrive.files.list.mockResolvedValue({
        data: {
          files: [
            { id: 'ok', name: 'a.txt', mimeType: 'text/plain' },
            { id: 'bad', name: 'b.txt', mimeType: 'text/plain' },
          ],
        },
      });
      mockDrive.files.get.mockImplementation(({ fileId }: any) => {
        if (fileId === 'bad') return Promise.reject(new Error('403 Forbidden'));
        return Promise.resolve({ data: Buffer.from('content') });
      });

      const result = await makeAdapter().syncAll();

      expect(result.documentsSynced).toBe(1);
      expect(result.errors).toEqual([
        expect.objectContaining({ fileId: 'bad', error: '403 Forbidden' }),
      ]);
    });
  });
});
