import { Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
  ConnectorFile,
  SyncResult,
} from '../connector-adapter.interface';

export class GoogleDriveAdapter extends ConnectorAdapter {
  private readonly logger = new Logger(GoogleDriveAdapter.name);
  private oauth2Client: any = null;

  constructor(config: ConnectorConfig) {
    super(config, 'GOOGLE_DRIVE');
  }

  async authenticate(): Promise<void> {
    try {
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
    } catch (error) {
      this.logger.error('Google Drive authentication failed', error);
      throw error;
    }
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

  async syncAll(): Promise<SyncResult> {
    const result: SyncResult = { documentsSynced: 0, errors: [], metadata: {} };

    try {
      await this.ensureAuth();
      const files = await this.listFiles();

      for (const file of files) {
        try {
          const content = await this.downloadFile(file.id);
          const metadata = await this.getFileMetadata(file.id);

          result.documentsSynced++;
          result.metadata[file.id] = {
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
          };
        } catch (error: any) {
          result.errors.push({ fileId: file.id, error: error.message });
        }
      }
    } catch (error: any) {
      this.logger.error('Sync all failed', error);
      result.errors.push({ fileId: 'all', error: error.message });
    }

    return result;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.oauth2Client) await this.authenticate();
  }
}
