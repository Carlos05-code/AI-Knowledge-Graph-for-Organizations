import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_providers.dart';
import '../auth/domain/auth_provider.dart';
import '../auth/domain/auth_state.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen> {
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authState = ref.watch(authProvider);
    final isAdmin = authState is Authenticated && authState.role == 'ADMIN';

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Admin'),
          bottom: isAdmin
              ? const TabBar(
                  tabs: [
                    Tab(text: 'Overview'),
                    Tab(text: 'Members'),
                    Tab(text: 'Audit Logs'),
                  ],
                )
              : null,
        ),
        body: !isAdmin
            ? Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.lock_outline,
                      size: 48,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 12),
                    const Text('Administrator access required'),
                  ],
                ),
              )
            : const TabBarView(
                children: [_OverviewTab(), _MembersTab(), _AuditLogsTab()],
              ),
      ),
    );
  }
}

class _OverviewTab extends ConsumerStatefulWidget {
  const _OverviewTab();

  @override
  ConsumerState<_OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends ConsumerState<_OverviewTab> {
  Map<String, dynamic>? _stats;
  String? _error;
  bool _loading = true;

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
      final stats = await ref.read(adminServiceProvider).getDashboard();
      if (!mounted) return;
      setState(() {
        _stats = stats;
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    final documents = _stats!['documents'] as Map? ?? const {};
    final users = _stats!['users'] as Map? ?? const {};
    final connectors = _stats!['connectors'] as Map? ?? const {};
    final meetings = _stats!['meetings'] as Map? ?? const {};
    final policies = _stats!['policies'] as Map? ?? const {};
    final activity = _stats!['recentActivity'] as List? ?? const [];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Organization', style: theme.textTheme.titleMedium),
          const SizedBox(height: 12),
          GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            childAspectRatio: 1.6,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: [
              _statCard(
                theme,
                Icons.description_outlined,
                'Documents',
                documents['total']?.toString() ?? '0',
                subtitle:
                    '${documents['indexed'] ?? 0} indexed · ${documents['pending'] ?? 0} pending',
              ),
              _statCard(
                theme,
                Icons.group_outlined,
                'Active users',
                users['total']?.toString() ?? '0',
              ),
              _statCard(
                theme,
                Icons.cloud_sync_outlined,
                'Connectors',
                connectors['active']?.toString() ?? '0',
                subtitle: 'enabled',
              ),
              _statCard(
                theme,
                Icons.meeting_room_outlined,
                'Meetings',
                meetings['total']?.toString() ?? '0',
              ),
              _statCard(
                theme,
                Icons.policy_outlined,
                'Policies',
                policies['total']?.toString() ?? '0',
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text('Recent activity', style: theme.textTheme.titleMedium),
          const SizedBox(height: 8),
          if (activity.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text('No recent activity')),
            )
          else
            ...activity.map(
              (entry) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  dense: true,
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.surfaceContainerHighest,
                    child: Icon(
                      _activityIcon(entry['entity']),
                      size: 16,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  title: Text(entry['action']?.toString() ?? ''),
                  subtitle: Text(
                    [
                          entry['entity'],
                          entry['entityId'],
                          _formatTime(entry['createdAt']),
                        ]
                        .whereType<String>()
                        .where((v) => v.isNotEmpty)
                        .join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  IconData _activityIcon(String? entity) {
    switch (entity) {
      case 'Document':
        return Icons.description_outlined;
      case 'User':
        return Icons.group_outlined;
      case 'Connector':
        return Icons.cloud_sync_outlined;
      case 'Meeting':
        return Icons.meeting_room_outlined;
      case 'Policy':
        return Icons.policy_outlined;
      default:
        return Icons.history;
    }
  }
}

class _MembersTab extends ConsumerStatefulWidget {
  const _MembersTab();

  @override
  ConsumerState<_MembersTab> createState() => _MembersTabState();
}

class _MembersTabState extends ConsumerState<_MembersTab> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _members = [];
  Map<String, dynamic>? _meta;
  String? _error;
  bool _loading = true;
  int _page = 1;
  String? _busyId;

  static const _roles = ['ADMIN', 'USER', 'VIEWER'];
  static const _roleLabels = {
    'ADMIN': 'Admin',
    'USER': 'User',
    'VIEWER': 'Viewer',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(usersServiceProvider)
          .listMembers(
            page: _page,
            limit: 50,
            query: _searchController.text.trim(),
          );
      if (!mounted) return;
      setState(() {
        _members = (result['data'] as List? ?? [])
            .map((m) => (m as Map).cast<String, dynamic>())
            .toList();
        _meta = result['meta'] as Map<String, dynamic>?;
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

  Future<void> _update(
    Map<String, dynamic> member,
    Map<String, dynamic> changes,
  ) async {
    setState(() {
      _busyId = member['id'] as String;
      _error = null;
    });
    try {
      await ref
          .read(usersServiceProvider)
          .updateMember(member['id'] as String, changes);
      if (!mounted) return;
      setState(() {
        _members = _members
            .map((m) => m['id'] == member['id'] ? {...m, ...changes} : m)
            .toList();
        _busyId = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busyId = null;
        _error = 'Failed to update ${member['email']}: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authState = ref.watch(authProvider);
    final isAdmin = authState is Authenticated && authState.role == 'ADMIN';
    final myUserId = isAdmin ? authState.userId : null;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _searchController,
                  decoration: const InputDecoration(
                    hintText: 'Search members...',
                    prefixIcon: Icon(Icons.search),
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onSubmitted: (_) {
                    _page = 1;
                    _load();
                  },
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Search',
                onPressed: () {
                  _page = 1;
                  _load();
                },
                icon: const Icon(Icons.search),
              ),
            ],
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _members.isEmpty
              ? const Center(child: Text('No members found'))
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _members.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final member = _members[index];
                    final isMe = member['id'] == myUserId;
                    final busy = _busyId == member['id'];
                    final role = member['role']?.toString() ?? 'USER';
                    final active = member['isActive'] == true;

                    return Card(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${member['firstName'] ?? ''} ${member['lastName'] ?? ''}${isMe ? ' (you)' : ''}',
                                    style: theme.textTheme.titleSmall,
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    member['email']?.toString() ?? '',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                  if ((member['title']?.toString() ?? '')
                                      .isNotEmpty)
                                    Text(
                                      [member['title'], member['department']]
                                          .whereType<String>()
                                          .where((v) => v.isNotEmpty)
                                          .join(' · '),
                                      style: theme.textTheme.bodySmall,
                                    ),
                                ],
                              ),
                            ),
                            if (busy)
                              const Padding(
                                padding: EdgeInsets.symmetric(horizontal: 16),
                                child: SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              )
                            else ...[
                              Switch(
                                value: active,
                                onChanged: (v) =>
                                    _update(member, {'isActive': v}),
                              ),
                              const SizedBox(width: 8),
                              DropdownButton<String>(
                                value: _roles.contains(role) ? role : 'USER',
                                items: _roles.map((r) {
                                  return DropdownMenuItem(
                                    value: r,
                                    child: Text(_roleLabels[r] ?? r),
                                  );
                                }).toList(),
                                onChanged: isMe
                                    ? null
                                    : (v) {
                                        if (v != null && v != role) {
                                          _update(member, {'role': v});
                                        }
                                      },
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        if (_meta != null &&
            _meta!['totalPages'] != null &&
            _meta!['totalPages'] > 1)
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  tooltip: 'Previous page',
                  onPressed: _page > 1
                      ? () {
                          _page--;
                          _load();
                        }
                      : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('Page $_page of ${_meta!['totalPages']}'),
                IconButton(
                  tooltip: 'Next page',
                  onPressed:
                      (_page * 50) < (int.parse(_meta!['total'].toString()))
                      ? () {
                          _page++;
                          _load();
                        }
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _AuditLogsTab extends ConsumerStatefulWidget {
  const _AuditLogsTab();

  @override
  ConsumerState<_AuditLogsTab> createState() => _AuditLogsTabState();
}

class _AuditLogsTabState extends ConsumerState<_AuditLogsTab> {
  List<Map<String, dynamic>> _logs = [];
  Map<String, dynamic>? _meta;
  String? _error;
  bool _loading = true;
  int _page = 1;
  String? _entity;
  String? _action;

  static const _entities = <String>[
    'Document',
    'User',
    'Connector',
    'Conversation',
    'Meeting',
    'Policy',
  ];
  static const _actions = <String>[
    'CREATE',
    'UPDATE',
    'DELETE',
    'LOGIN',
    'UPLOAD',
    'SYNC',
  ];

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
      final result = await ref
          .read(adminServiceProvider)
          .getAuditLogs(page: _page, entity: _entity, action: _action);
      if (!mounted) return;
      setState(() {
        _logs = (result['data'] as List? ?? [])
            .map((e) => (e as Map).cast<String, dynamic>())
            .toList();
        _meta = result['meta'] as Map<String, dynamic>?;
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

  void _resetPage() {
    _page = 1;
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final totalStr = _meta?['total'].toString() ?? '0';

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: _entity,
                  decoration: const InputDecoration(
                    labelText: 'Entity',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    const DropdownMenuItem<String?>(
                      value: null,
                      child: Text('All'),
                    ),
                    ..._entities.map(
                      (e) =>
                          DropdownMenuItem<String?>(value: e, child: Text(e)),
                    ),
                  ],
                  onChanged: (v) {
                    _entity = v;
                    _resetPage();
                  },
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String?>(
                  initialValue: _action,
                  decoration: const InputDecoration(
                    labelText: 'Action',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  items: [
                    const DropdownMenuItem<String?>(
                      value: null,
                      child: Text('All'),
                    ),
                    ..._actions.map(
                      (a) =>
                          DropdownMenuItem<String?>(value: a, child: Text(a)),
                    ),
                  ],
                  onChanged: (v) {
                    _action = v;
                    _resetPage();
                  },
                ),
              ),
            ],
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(
                _error!,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ),
          ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _logs.isEmpty
              ? const Center(child: Text('No audit logs'))
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _logs.length + 1,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    if (index == _logs.length) {
                      if (_meta?['hasNext'] != true) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(8),
                            child: Text(
                                  '$totalStr entries',
                              style: theme.textTheme.bodySmall,
                            ),
                          ),
                        );
                      }
                      return Center(
                        child: TextButton.icon(
                          onPressed: () {
                            _page++;
                            _load();
                          },
                          icon: const Icon(Icons.more_horiz),
                          label: const Text('Load more'),
                        ),
                      );
                    }
                    return _logCard(_logs[index]);
                  },
                ),
        ),
      ],
    );
  }

  Widget _logCard(Map<String, dynamic> log) {
    final theme = Theme.of(context);
    final action = log['action']?.toString() ?? '';
    final entity = log['entity']?.toString() ?? '';

    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primaryContainer,
          child: Text(
            (action.length > 1 ? action.substring(0, 2) : action).toUpperCase(),
            style: theme.textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        title: Text(
          action.isEmpty ? 'Unknown action' : action,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          [
            entity,
            log['entityId']?.toString() ?? '',
            log['userId']?.toString().isNotEmpty == true
                ? 'user ${log['userId']}'
                : '',
          ].where((v) => v.isNotEmpty).join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Text(
          _formatTime(log['createdAt']),
          style: theme.textTheme.labelSmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

Widget _statCard(
  ThemeData theme,
  IconData icon,
  String label,
  String value, {
  String? subtitle,
}) {
  return Card(
    margin: EdgeInsets.zero,
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  style: theme.textTheme.labelSmall,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            value,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(
              subtitle,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    ),
  );
}

String _formatTime(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  try {
    return DateFormat('MMM d, HH:mm').format(DateTime.parse(iso).toLocal());
  } catch (_) {
    return iso;
  }
}
