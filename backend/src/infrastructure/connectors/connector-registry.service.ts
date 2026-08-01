import { Injectable, Logger } from '@nestjs/common';
import { ConnectorAdapter, ConnectorConfig } from './connector-adapter.interface';
import { GoogleDriveAdapter } from './adapters/google-drive.adapter';
import { SlackAdapter } from './adapters/slack.adapter';
import { GitHubAdapter } from './adapters/github.adapter';

export type AdapterConstructor = new (config: ConnectorConfig) => ConnectorAdapter;

@Injectable()
export class ConnectorRegistryService {
  private readonly logger = new Logger(ConnectorRegistryService.name);
  private readonly adapters = new Map<string, AdapterConstructor>();

  constructor() {
    this.register('GOOGLE_DRIVE', GoogleDriveAdapter);
    this.register('SLACK', SlackAdapter);
    this.register('GITHUB', GitHubAdapter);
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
