import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import '../../auth/domain/auth_provider.dart';
import '../../auth/domain/auth_state.dart';

class ConnectorsScreen extends ConsumerStatefulWidget {
  const ConnectorsScreen({super.key});

  @override
  ConsumerState<ConnectorsScreen> createState() => _ConnectorsScreenState();
}

class _ConnectorTypeMeta {
  final String type;
  final String label;
  final IconData icon;
  final String credentialsHint;

  const _ConnectorTypeMeta(this.type, this.label, this.icon, this.credentialsHint);
}

const _connectorTypeMeta = [
  _ConnectorTypeMeta('SLACK', 'Slack', Icons.chat_bubble_outline, '{"token": "xoxb-..."}'),
  _ConnectorTypeMeta('GITHUB', 'GitHub', Icons.code, '{"token": "ghp_..."}'),
  _ConnectorTypeMeta('GOOGLE_DRIVE', 'Google Drive', Icons.cloud_outlined, '{"refreshToken": "..."}'),
  _ConnectorTypeMeta('NOTION', 'Notion', Icons.notes, '{"token": "ntn_..."}'),
  _ConnectorTypeMeta('JIRA', 'Jira', Icons.bug_report_outlined, '{"email": "...", "apiToken": "..."}'),
  _ConnectorTypeMeta('LINEAR', 'Linear', Icons.trending_up, '{"apiKey": "..."}'),
  _ConnectorTypeMeta('CUSTOM', 'Custom API', Icons.extension_outlined, '{"key": "..."}'),
];

_ConnectorTypeMeta _metaFor(String type) {
  for (final item in _connectorTypeMeta) {
    if (item.type == type) return item;
  }
  return _connectorTypeMeta.last;
}

String _formatDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final dt = DateTime.tryParse(iso);
  if (dt == null) return '';
  final month = dt.month.toString().padLeft(2, '0');
  final day = dt.day.toString().padLeft(2, '0');
  final hour = dt.hour.toString().padLeft(2, '0');
  final minute = dt.minute.toString().padLeft(2, '0');
  return '${dt.year}-$month-$day $hour:$minute';
}

String _prettyJson(Object? value) =>
    const JsonEncoder.withIndent('  ').convert(value);

class _ConnectorsScreenState extends ConsumerState<ConnectorsScreen> {
  List<Map<String, dynamic>> _connectors = [];
  String? _error;
  bool _loading = true;

  bool get _isAdmin {
    final auth = ref.read(authProvider);
    return auth is Authenticated && auth.role == 'ADMIN';
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref.read(connectorsServiceProvider).listConnectors();
      if (!mounted) return;
      setState(() {
        _connectors = result;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _openDetail(Map<String, dynamic> connector) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _ConnectorDetailSheet(
        connector: connector,
        isAdmin: _isAdmin,
        onChanged: _load,
      ),
    );
  }

  void _openCreate() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CreateConnectorSheet(onCreated: _load),
    );
  }

  Future<void> _toggleEnabled(
    Map<String, dynamic> connector,
    bool enabled,
  ) async {
    try {
      await ref
          .read(connectorsServiceProvider)
          .updateConnector(connector['id'] as String, isEnabled: enabled);
      connector['isEnabled'] = enabled;
      if (mounted) setState(() {});
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Update failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Connectors'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: _isAdmin
          ? FloatingActionButton.extended(
              onPressed: _openCreate,
              icon: const Icon(Icons.add_link),
              label: const Text('Add Connector'),
            )
          : null,
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'Failed to load connectors:\n$_error',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: theme.colorScheme.error),
                    ),
                  ),
                )
              : _connectors.isEmpty
                  ? const Center(
                      child: Text('No connectors yet — add your first integration'),
                    )
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                        itemCount: _connectors.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final connector = _connectors[index];
                          return _ConnectorTile(
                            connector: connector,
                            isAdmin: _isAdmin,
                            onTap: () => _openDetail(connector),
                            onToggle: _isAdmin
                                ? (enabled) => _toggleEnabled(connector, enabled)
                                : null,
                          );
                        },
                      ),
                    ),
    );
  }
}

class _ConnectorTile extends StatelessWidget {
  final Map<String, dynamic> connector;
  final bool isAdmin;
  final VoidCallback onTap;
  final ValueChanged<bool>? onToggle;

  const _ConnectorTile({
    required this.connector,
    required this.isAdmin,
    required this.onTap,
    this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final type = connector['type']?.toString() ?? 'CUSTOM';
    final meta = _metaFor(type);
    final enabled = connector['isEnabled'] != false;
    final lastSync = connector['lastSyncAt']?.toString();

    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primaryContainer,
          child: Icon(meta.icon, size: 20),
        ),
        title: Text(
          connector['name']?.toString() ?? 'Unnamed connector',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          [
            meta.label,
            lastSync != null ? 'Last sync ${_formatDate(lastSync)}' : 'Never synced',
            enabled ? '' : 'disabled',
          ].where((v) => v.isNotEmpty).join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (isAdmin)
              Switch(value: enabled, onChanged: onToggle),
            const Icon(Icons.chevron_right),
          ],
        ),
        onTap: onTap,
      ),
    );
  }
}

class _CreateConnectorSheet extends ConsumerStatefulWidget {
  final VoidCallback onCreated;

  const _CreateConnectorSheet({required this.onCreated});

  @override
  ConsumerState<_CreateConnectorSheet> createState() => _CreateConnectorSheetState();
}

class _CreateConnectorSheetState extends ConsumerState<_CreateConnectorSheet> {
  final _formKey = GlobalKey<FormState>();
  String _type = 'SLACK';
  final _nameController = TextEditingController();
  final _credentialsController = TextEditingController();
  final _channelController = TextEditingController();
  final _intervalController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _credentialsController.dispose();
    _channelController.dispose();
    _intervalController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final config = <String, dynamic>{};
      if (_channelController.text.trim().isNotEmpty) {
        config['channelId'] = _channelController.text.trim();
      }
      final interval = _intervalController.text.trim();
      await ref.read(connectorsServiceProvider).createConnector(
            name: _nameController.text.trim(),
            type: _type,
            credentials: _credentialsController.text.trim(),
            config: config,
            syncInterval: interval.isNotEmpty ? int.tryParse(interval) : null,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onCreated();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Connector created')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Create failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meta = _metaFor(_type);

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Add Connector',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Type'),
                items: _connectorTypeMeta
                    .map((m) => DropdownMenuItem(value: m.type, child: Text(m.label)))
                    .toList(),
                onChanged: (value) {
                  if (value != null) setState(() => _type = value);
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _nameController,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Name is required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _credentialsController,
                maxLines: 3,
                decoration: InputDecoration(
                  labelText: 'Credentials (JSON)',
                  helperText: 'Example: ${meta.credentialsHint}',
                  alignLabelWithHint: true,
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Credentials are required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _channelController,
                decoration: const InputDecoration(
                  labelText: 'Slack channel id (optional)',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _intervalController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Auto-sync interval (minutes, min 5)',
                ),
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check),
                label: const Text('Create Connector'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ConnectorDetailSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> connector;
  final bool isAdmin;
  final VoidCallback onChanged;

  const _ConnectorDetailSheet({
    required this.connector,
    required this.isAdmin,
    required this.onChanged,
  });

  @override
  ConsumerState<_ConnectorDetailSheet> createState() =>
      _ConnectorDetailSheetState();
}

class _ConnectorDetailSheetState extends ConsumerState<_ConnectorDetailSheet> {
  List<Map<String, dynamic>> _runs = [];
  bool _loadingRuns = true;
  bool _busy = false;
  String? _runsError;

  @override
  void initState() {
    super.initState();
    _loadRuns();
  }

  Future<void> _loadRuns() async {
    try {
      final runs = await ref
          .read(connectorsServiceProvider)
          .getRuns(widget.connector['id'] as String);
      if (!mounted) return;
      setState(() {
        _runs = runs;
        _loadingRuns = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _runsError = e.toString();
        _loadingRuns = false;
      });
    }
  }

  Future<void> _testConnection() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(connectorsServiceProvider)
          .testConnector(widget.connector['id'] as String);
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Connection test passed')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Test failed: $e')),
      );
    }
  }

  Future<void> _sync() async {
    setState(() => _busy = true);
    try {
      final result = await ref
          .read(connectorsServiceProvider)
          .syncConnector(widget.connector['id'] as String);
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onChanged();
      final count = result['documentsSynced'] ?? 0;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Sync completed — $count document(s) synced')),
      );
      _loadRuns();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Sync failed: $e')),
      );
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete connector?'),
        content: Text(
          '"${widget.connector['name']}" will be removed. Documents it synced are kept.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(connectorsServiceProvider)
          .deleteConnector(widget.connector['id'] as String);
      if (!mounted) return;
      widget.onChanged();
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: $e')),
      );
    }
  }

  Color _runColor(String status) {
    switch (status) {
      case 'COMPLETED':
        return Colors.green;
      case 'RUNNING':
        return Colors.blue;
      case 'FAILED':
        return Theme.of(context).colorScheme.error;
      default:
        return Colors.amber.shade800;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final connector = widget.connector;
    final type = connector['type']?.toString() ?? 'CUSTOM';
    final meta = _metaFor(type);
    final enabled = connector['isEnabled'] != false;
    final lastSync = connector['lastSyncAt']?.toString();

    return DraggableScrollableSheet(
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 48),
        children: [
          Row(
            children: [
              CircleAvatar(
                backgroundColor: theme.colorScheme.primaryContainer,
                child: Icon(meta.icon),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      connector['name']?.toString() ?? 'Unnamed',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text(
                      meta.label,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              if (widget.isAdmin)
                Switch(
                  value: enabled,
                  onChanged: (value) async {
                    try {
                      await ref
                          .read(connectorsServiceProvider)
                          .updateConnector(
                            connector['id'] as String,
                            isEnabled: value,
                          );
                      if (mounted) setState(() {});
                      widget.onChanged();
                    } catch (_) {}
                  },
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (widget.isAdmin)
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _busy ? null : _testConnection,
                  icon: const Icon(Icons.bolt_outlined, size: 18),
                  label: const Text('Test'),
                ),
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: _busy ? null : _sync,
                  icon: const Icon(Icons.sync, size: 18),
                  label: const Text('Sync now'),
                ),
                const Spacer(),
                IconButton(
                  tooltip: 'Delete',
                  onPressed: _busy ? null : _delete,
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
          const SizedBox(height: 16),
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _infoRow(
                    'Last sync',
                    lastSync != null ? _formatDate(lastSync) : 'Never',
                  ),
                  _infoRow(
                    'Sync interval',
                    connector['syncInterval']?.toString() != null
                        ? '${connector['syncInterval']} min'
                        : 'Manual only',
                  ),
                  if (connector['config'] is Map &&
                      (connector['config'] as Map).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        'Config:\n${_prettyJson(connector['config'])}',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            'Sync history',
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          if (_loadingRuns)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            )
          else if (_runsError != null)
            Text(_runsError!, style: TextStyle(color: theme.colorScheme.error))
          else if (_runs.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'No sync runs yet',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
            )
          else
            ..._runs.map(
              (run) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  dense: true,
                  leading: Icon(
                    run['status'] == 'COMPLETED'
                        ? Icons.check_circle_outline
                        : run['status'] == 'FAILED'
                            ? Icons.error_outline
                            : Icons.sync,
                    color: _runColor(run['status']?.toString() ?? ''),
                  ),
                  title: Text(run['status']?.toString() ?? ''),
                  subtitle: Text(
                    [
                      run['startedAt'] != null
                          ? _formatDate(run['startedAt'].toString())
                          : '',
                      '${run['documentsSynced'] ?? 0} docs',
                      run['errorCount'] != null &&
                              (run['errorCount'] as num?)?.toInt() != 0
                          ? '${run['errorCount']} errors'
                          : '',
                    ].where((v) => v.isNotEmpty).join(' · '),
                  ),
                  trailing:
                      run['errorLog']?.toString().isNotEmpty == true
                          ? IconButton(
                              tooltip: 'Errors',
                              icon: const Icon(Icons.info_outline),
                              onPressed: () => showDialog<void>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  title: const Text('Sync errors'),
                                  content: SingleChildScrollView(
                                    child: Text(run['errorLog'].toString()),
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () => Navigator.of(context).pop(),
                                      child: const Text('Close'),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : null,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: Theme.of(context).textTheme.bodySmall),
          ),
          Expanded(
            child: Text(
              value,
              style: Theme.of(context)
                  .textTheme
                  .bodySmall
                  ?.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }
}