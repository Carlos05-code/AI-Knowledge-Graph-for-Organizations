import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectorAdapter,
  ConnectorConfig,
} from './connector-adapter.interface';
import { GoogleDriveAdapter } from './adapters/google-drive.adapter';
import { SlackAdapter } from './adapters/slack.adapter';
import { GitHubAdapter } from './adapters/github.adapter';
import { NotionAdapter } from './adapters/notion.adapter';
import { JiraAdapter } from './adapters/jira.adapter';
import { LinearAdapter } from './adapters/linear.adapter';
import { ConfluenceAdapter } from './adapters/confluence.adapter';
import { GitLabAdapter } from './adapters/gitlab.adapter';
import { OneDriveAdapter } from './adapters/onedrive.adapter';
import { SharePointAdapter } from './adapters/sharepoint.adapter';
import { OutlookAdapter } from './adapters/outlook.adapter';
import { GmailAdapter } from './adapters/gmail.adapter';
import { TeamsAdapter } from './adapters/teams.adapter';

export type AdapterConstructor = new (
  config: ConnectorConfig,
) => ConnectorAdapter;

@Injectable()
export class ConnectorRegistryService {
  private readonly logger = new Logger(ConnectorRegistryService.name);
  private readonly adapters = new Map<string, AdapterConstructor>();

  constructor() {
    this.register('GOOGLE_DRIVE', GoogleDriveAdapter);
    this.register('SLACK', SlackAdapter);
    this.register('GITHUB', GitHubAdapter);
    this.register('NOTION', NotionAdapter);
    this.register('JIRA', JiraAdapter);
    this.register('LINEAR', LinearAdapter);
    this.register('CONFLUENCE', ConfluenceAdapter);
    this.register('GITLAB', GitLabAdapter);
    this.register('ONEDRIVE', OneDriveAdapter);
    this.register('SHAREPOINT', SharePointAdapter);
    this.register('OUTLOOK', OutlookAdapter);
    this.register('GMAIL', GmailAdapter);
    this.register('TEAMS', TeamsAdapter);
  }

  register(type: string, adapterClass: AdapterConstructor): void {
    this.adapters.set(type, adapterClass);
    this.logger.log(`Registered connector adapter: ${type}`);
  }

  getAdapter(type: string, config: ConnectorConfig): ConnectorAdapter {
    const AdapterClass = this.adapters.get(type);
    if (!AdapterClass) {
      throw new Error(`No adapter registered for connector type: ${type}`);
    }
    return new AdapterClass(config);
  }

  getSupportedTypes(): string[] {
    return Array.from(this.adapters.keys());
  }

  isTypeSupported(type: string): boolean {
    return this.adapters.has(type);
  }
}
