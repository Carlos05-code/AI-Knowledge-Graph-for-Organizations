import { Logger } from '@nestjs/common';
import { ConnectorConfig } from '../connector-adapter.interface';

const TOKEN_EXPIRY_SKEW_MS = 60_000;

/**
 * Shared app-only (client-credentials) OAuth for Microsoft Graph, used by
 * every Graph-backed adapter (OneDrive, SharePoint, Outlook, ...) since
 * they all authenticate against the same tenant token endpoint regardless
 * of which Graph resource they end up calling.
 */
export class MicrosoftGraphAuth {
  private readonly logger = new Logger(MicrosoftGraphAuth.name);
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConnectorConfig) {}

  private get tenantId(): string {
    const tenantId = this.config.tenantId as string;
    if (!tenantId) {
      throw new Error(
        'Microsoft tenant is missing. Provide `tenantId` in credentials.',
      );
    }
    return tenantId;
  }

  private get clientId(): string {
    const clientId = this.config.clientId as string;
    if (!clientId) {
      throw new Error(
        'Microsoft client ID is missing. Provide `clientId` in credentials.',
      );
    }
    return clientId;
  }

  private get clientSecret(): string {
    const clientSecret = this.config.clientSecret as string;
    if (!clientSecret) {
      throw new Error(
        'Microsoft client secret is missing. Provide `clientSecret` in credentials.',
      );
    }
    return clientSecret;
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (
      !forceRefresh &&
      this.accessToken &&
      Date.now() < this.tokenExpiresAt - TOKEN_EXPIRY_SKEW_MS
    ) {
      return this.accessToken;
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }).toString(),
      },
    );

    const json = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!response.ok || !json.access_token) {
      const message = json.error_description || `HTTP ${response.status}`;
      this.logger.warn(`Microsoft Graph token request failed: ${message}`);
      throw new Error(`Microsoft Graph token request failed: ${message}`);
    }

    this.accessToken = json.access_token;
    this.tokenExpiresAt = Date.now() + (json.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }
}
