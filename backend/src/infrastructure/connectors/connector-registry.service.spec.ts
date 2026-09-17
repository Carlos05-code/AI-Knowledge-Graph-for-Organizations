import { ConnectorRegistryService } from './connector-registry.service';

describe('ConnectorRegistryService', () => {
  let registry: ConnectorRegistryService;

  beforeEach(() => {
    registry = new ConnectorRegistryService();
  });

  it.each(['GOOGLE_DRIVE', 'SLACK', 'GITHUB', 'NOTION', 'JIRA', 'LINEAR'])(
    'resolves a %s adapter',
    (type) => {
      expect(registry.isTypeSupported(type)).toBe(true);
      const adapter = registry.getAdapter(type, { accessToken: 'x' });
      expect(adapter.getType()).toBe(type);
    },
  );

  it('throws for an unregistered connector type', () => {
    expect(() => registry.getAdapter('CONFLUENCE', {})).toThrow(
      /No adapter registered/,
    );
  });

  it('lists all supported types', () => {
    expect(registry.getSupportedTypes()).toEqual(
      expect.arrayContaining([
        'GOOGLE_DRIVE',
        'SLACK',
        'GITHUB',
        'NOTION',
        'JIRA',
        'LINEAR',
      ]),
    );
  });
});
