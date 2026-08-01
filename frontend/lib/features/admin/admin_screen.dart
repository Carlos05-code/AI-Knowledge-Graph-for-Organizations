import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import '../auth/domain/auth_provider.dart';
import '../auth/domain/auth_state.dart';

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen> {
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
    _loadMembers();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadMembers() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref.read(usersServiceProvider).listMembers(
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

  Future<void> _updateMember(Map<String, dynamic> member, Map<String, dynamic> changes) async {
    setState(() {
      _busyId = member['id'] as String;
      _error = null;
    });
    try {
      await ref.read(usersServiceProvider).updateMember(member['id'] as String, changes);
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

    return Scaffold(
      appBar: AppBar(title: const Text('Admin')),
      body: !isAdmin
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.lock_outline, size: 48, color: theme.colorScheme.onSurfaceVariant),
                  const SizedBox(height: 12),
                  const Text('Administrator access required'),
                ],
              ),
            )
          : Column(
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
                          onSubmitted: (_) => _loadMembers(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton(
                        tooltip: 'Search',
                        onPressed: _loadMembers,
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
                      child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
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
                                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
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
                                              if ((member['title']?.toString() ?? '').isNotEmpty)
                                                Text(
                                                  [
                                                    member['title'],
                                                    member['department'],
                                                  ].whereType<String>().where((v) => v.isNotEmpty).join(' · '),
                                                  style: theme.textTheme.bodySmall,
                                                ),
                                            ],
                                          ),
                                        ),
                                        if (busy)
                                          const Padding(
                                            padding: EdgeInsets.symmetric(horizontal: 16),
                                            child: SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2)),
                                          )
                                        else ...[
                                          Switch(
                                            value: active,
                                            onChanged: (v) => _updateMember(member, {'isActive': v}),
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
                                                      _updateMember(member, {'role': v});
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
                if (_meta != null && _meta!['totalPages'] != null && _meta!['totalPages'] > 1)
                  Padding(
                    padding: const EdgeInsets.all(8),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        IconButton(
                          tooltip: 'Previous page',
                          onPressed: _page > 1 ? () { _page--; _loadMembers(); } : null,
                          icon: const Icon(Icons.chevron_left),
                        ),
                        Text('Page $_page of ${_meta!['totalPages']}'),
                        IconButton(
                          tooltip: 'Next page',
                          onPressed: (_page * 50) < (int.parse(_meta!['total'].toString()))
                              ? () { _page++; _loadMembers(); }
                              : null,
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
    );
  }
}
