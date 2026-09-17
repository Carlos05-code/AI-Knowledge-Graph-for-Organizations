import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorDocument,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';

/** Google-native types can't be downloaded as raw bytes; they must be exported to a real format. */
const EXPORT_MIME_TYPES: Record<
  string,
  { mimeType: string; fileType: string }
> = {
  [`${GOOGLE_NATIVE_PREFIX}document`]: {
    mimeType: 'text/plain',
    fileType: 'txt',
  },
  [`${GOOGLE_NATIVE_PREFIX}spreadsheet`]: {
    mimeType: 'text/csv',
    fileType: 'csv',
  },
  [`${GOOGLE_NATIVE_PREFIX}presentation`]: {
    mimeType: 'text/plain',
    fileType: 'txt',
  },
};

export class GoogleDriveAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(GoogleDriveAdapter.name);
  private oauth2Client: any = null;

  constructor(config: ConnectorConfig) {
    super(config, 'GOOGLE_DRIVE');
  }

  authenticate(): Promise<void> {
    const { google } = require('googleapis');
    this.oauth2Client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri,
    );
    this.oauth2Client.setCredentials({
      access_token: this.config.accessToken,
      refresh_token: this.config.refreshToken,
    });
    this.logger.log('Google Drive authenticated');
    return Promise.resolve();
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.oauth2Client) await this.authenticate();
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.config.accessToken = credentials.access_token;
      this.config.refreshToken =
        credentials.refresh_token || this.config.refreshToken;
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw error;
    }
  }

  async listFiles(folderId?: string): Promise<ConnectorFile[]> {
    await this.ensureAuth();
    try {
      const { google } = require('googleapis');
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      const query = folderId
        ? `'${folderId}' in parents and trashed = false`
        : 'trashed = false';

      const response = await drive.files.list({
        q: query,
        fields:
          'files(id, name, mimeType, size, parents, createdTime, modifiedTime)',
        pageSize: 100,
      });

      return (response.data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: parseInt(file.size || '0', 10),
        path: file.name,
        parentId: file.parents?.[0],
        createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
        updatedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
      }));
    } catch (error) {
      this.logger.error('Failed to list files', error);
      throw error;
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    await this.ensureAuth();
    try {
      const { google } = require('googleapis');
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      const response = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' },
      );

      return Buffer.from(response.data);
    } catch (error) {
      this.logger.error(`Failed to download file ${fileId}`, error);
      throw error;
    }
  }

  async getFileMetadata(fileId: string): Promise<Record<string, unknown>> {
    await this.ensureAuth();
    try {
      const { google } = require('googleapis');
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      const response = await drive.files.get({
        fileId,
        fields:
          'id, name, mimeType, size, owners, lastModifyingUser, description, createdTime, modifiedTime, permissions',
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get metadata for ${fileId}`, error);
      throw error;
    }
  }

  async searchFiles(query: string): Promise<ConnectorFile[]> {
    await this.ensureAuth();
    try {
      const { google } = require('googleapis');
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      const response = await drive.files.list({
        q: `name contains '${query}' and trashed = false`,
        fields:
          'files(id, name, mimeType, size, parents, createdTime, modifiedTime)',
        pageSize: 50,
      });

      return (response.data.files || []).map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: parseInt(file.size || '0', 10),
        path: file.name,
        parentId: file.parents?.[0],
      }));
    } catch (error) {
      this.logger.error('Search failed', error);
      throw error;
    }
  }

  private async exportGoogleNativeFile(
    fileId: string,
    mimeType: string,
  ): Promise<Buffer> {
    const { google } = require('googleapis');
    const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
    const response = await drive.files.export(
      { fileId, mimeType },
      { responseType: 'arraybuffer' },
    );
    return Buffer.from(response.data);
  }

  async syncAll(): Promise<SyncResult> {
    const documents: ConnectorDocument[] = [];
    const errors: Array<{ fileId: string; error: string }> = [];
    const metadata: Record<string, unknown> = { skipped: 0 };

    try {
      await this.ensureAuth();
      const files = (await this.listFiles()).filter(
        (f) => f.mimeType !== `${GOOGLE_NATIVE_PREFIX}folder`,
      );
      metadata.filesFound = files.length;

      for (const file of files) {
        try {
          let bytes: Buffer;
          let fileType: string;

          const exportTarget = EXPORT_MIME_TYPES[file.mimeType];
          if (file.mimeType.startsWith(GOOGLE_NATIVE_PREFIX)) {
            if (!exportTarget) {
              metadata.skipped = (metadata.skipped as number) + 1;
              continue; // Forms/Drawings/Sites/etc. have no useful text export
            }
            bytes = await this.exportGoogleNativeFile(
              file.id,
              exportTarget.mimeType,
            );
            fileType = exportTarget.fileType;
          } else {
            bytes = await this.downloadFile(file.id);
            fileType = file.name.split('.').pop() || 'txt';
          }

          if (bytes.length > MAX_DOWNLOAD_BYTES) {
            errors.push({
              fileId: file.id,
              error: `File exceeds the ${MAX_DOWNLOAD_BYTES} byte download limit`,
            });
            continue;
          }
          if (bytes.includes(0)) {
            metadata.skipped = (metadata.skipped as number) + 1;
            continue; // binary file — no text content to index
          }

          documents.push({
            id: file.id,
            name: file.name,
            filePath: file.path,
            mimeType: exportTarget?.mimeType || file.mimeType,
            fileType,
            size: bytes.length,
            content: bytes.toString('utf-8'),
            metadata: { parentId: file.parentId, driveMimeType: file.mimeType },
          });
        } catch (error: any) {
          errors.push({ fileId: file.id, error: error.message });
        }
      }
    } catch (error: any) {
      this.logger.error('Sync all failed', error);
      errors.push({ fileId: 'all', error: error.message });
    }

    return { documentsSynced: documents.length, errors, metadata, documents };
  }

  private async ensureAuth(): Promise<void> {
    if (!this.oauth2Client) await this.authenticate();
  }
}
