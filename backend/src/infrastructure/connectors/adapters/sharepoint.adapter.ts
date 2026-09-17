import { ConnectorConfig } from '../connector-adapter.interface';
import { MicrosoftGraphDriveAdapter } from './microsoft-graph-drive.adapter';

/**
 * SharePoint document libraries via Microsoft Graph's /sites/{id}/drive
 * resource — identical shape to OneDrive's /drive, just scoped to a site.
 */
export class SharePointAdapter extends MicrosoftGraphDriveAdapter {
  constructor(config: ConnectorConfig) {
    super(config, 'SHAREPOINT');
  }

  protected get driveBase(): string {
    const siteId = this.config.siteId as string | undefined;
    if (!siteId) {
      throw new Error(
        'SharePoint site is missing. Provide `siteId` in credentials.',
      );
    }
    return `/sites/${siteId}/drive`;
  }
}
