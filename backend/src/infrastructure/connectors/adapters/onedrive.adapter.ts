import { ConnectorConfig } from '../connector-adapter.interface';
import { MicrosoftGraphDriveAdapter } from './microsoft-graph-drive.adapter';

/**
 * OneDrive via Microsoft Graph's /drive resource. App-only auth means
 * there's no signed-in "me" — a target drive must be identified either
 * directly (`driveId`) or by owning user (`userId`, resolved to their
 * default drive).
 */
export class OneDriveAdapter extends MicrosoftGraphDriveAdapter {
  constructor(config: ConnectorConfig) {
    super(config, 'ONEDRIVE');
  }

  protected get driveBase(): string {
    const driveId = this.config.driveId as string | undefined;
    if (driveId) return `/drives/${driveId}`;

    const userId = this.config.userId as string | undefined;
    if (userId) return `/users/${userId}/drive`;

    throw new Error(
      'OneDrive target is missing. Provide `driveId` or `userId` in credentials.',
    );
  }
}
