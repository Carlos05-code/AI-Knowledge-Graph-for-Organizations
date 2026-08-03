import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import '../../auth/domain/auth_provider.dart';
import '../../auth/domain/auth_state.dart';

class PoliciesScreen extends ConsumerStatefulWidget {
  const PoliciesScreen({super.key});

  @override
  ConsumerState<PoliciesScreen> createState() => _PoliciesScreenState();
}

class _PoliciesScreenState extends ConsumerState<PoliciesScreen> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _policies = [];
  List<Map<String, dynamic>> _searchResults = [];
  Map<String, dynamic>? _meta;
  String? _error;
  bool _loading = true;
  bool _searching = false;
  int _page = 1;
  String? _category;
  bool _onlyActive = false;

  bool get _isAdmin {
    final auth = ref.read(authProvider);
    return auth is Authenticated && auth.role == 'ADMIN';
  }

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

  List<String> get _categories {
    final seen = <String>{};
    for (final p in _policies) {
      final category = p['category']?.toString();
      if (category != null && category.isNotEmpty) seen.add(category);
    }
    return seen.toList()..sort();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref.read(policiesServiceProvider).listPolicies(
            page: _page,
            category: _category,
            active: _onlyActive ? true : null,
          );
      if (!mounted) return;
      setState(() {
        _policies = (result['data'] as List? ?? [])
            .map((p) => (p as Map).cast<String, dynamic>())
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

  Future<void> _search(String query) async {
    if (query.trim().isEmpty) {
      setState(() {
        _searchResults = [];
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    try {
      final results =
          await ref.read(policiesServiceProvider).searchPolicies(query);
      if (!mounted) return;
      setState(() {
        _searchResults = results;
        _searching = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _searching = false;
        _error = e.toString();
      });
    }
  }

  bool get _showSearch => _searchController.text.trim().isNotEmpty;

  void _openCreate() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PolicyEditorSheet(onSaved: _load),
    );
  }

  void _openDetail(Map<String, dynamic> policy) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _PolicyDetailSheet(
        policy: policy,
        isAdmin: _isAdmin,
        onChanged: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Policies'),
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
              icon: const Icon(Icons.add),
              label: const Text('Add Policy'),
            )
          : null,
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              controller: _searchController,
              onChanged: _search,
              decoration: InputDecoration(
                hintText: 'Search policies…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          _search('');
                        },
                      )
                    : null,
              ),
            ),
          ),
          if (!_showSearch)
            SizedBox(
              height: 48,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                children: [
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: const Text('All'),
                      selected: _category == null,
                      onSelected: (_) {
                        _category = null;
                        _page = 1;
                        _load();
                      },
                    ),
                  ),
                  ..._categories.map(
                    (c) => Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(c),
                        selected: _category == c,
                        onSelected: (_) {
                          _category = c;
                          _page = 1;
                          _load();
                        },
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: FilterChip(
                      label: const Text('Active only'),
                      selected: _onlyActive,
                      onSelected: (v) {
                        _onlyActive = v;
                        _page = 1;
                        _load();
                      },
                    ),
                  ),
                ],
              ),
            ),
          if (_error != null && !_searching)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            ),
          Expanded(
            child: _loading || _searching
                ? const Center(child: CircularProgressIndicator())
                : _showSearch
                    ? _searchResults.isEmpty
                        ? const Center(child: Text('No matching policies'))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                            itemCount: _searchResults.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (context, index) =>
                                _policyCard(_searchResults[index]),
                          )
                    : _policies.isEmpty
                        ? const Center(child: Text('No policies yet — add your first policy'))
                        : RefreshIndicator(
                            onRefresh: _load,
                            child: ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
                              itemCount: _policies.length,
                              separatorBuilder: (_, __) => const SizedBox(height: 8),
                              itemBuilder: (context, index) =>
                                  _policyCard(_policies[index]),
                            ),
                          ),
          ),
          if (!_showSearch &&
              _meta != null &&
              int.parse(_meta!['total'].toString()) > 0)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
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
                  Text(
                    'Page ${_meta!['page']} of ${_meta!['totalPages']} · ${_meta!['total']} policies',
                    style: theme.textTheme.bodySmall,
                  ),
                  IconButton(
                    tooltip: 'Next page',
                    onPressed: _meta!['hasNext'] == true
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
      ),
    );
  }

  Widget _policyCard(Map<String, dynamic> policy) {
    final theme = Theme.of(context);
    final active = policy['isActive'] != false;

    return Card(
      margin: EdgeInsets.zero,
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: theme.colorScheme.primaryContainer,
          child: const Icon(Icons.policy_outlined, size: 20),
        ),
        title: Text(
          policy['title']?.toString() ?? 'Untitled policy',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          [
            policy['category']?.toString() ?? '',
            'v${policy['version'] ?? 1}',
            active ? '' : 'inactive',
          ].where((v) => v.isNotEmpty).join(' · '),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: (active ? Colors.green : Colors.grey)
                    .withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                active ? 'Active' : 'Inactive',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: active ? Colors.green : Colors.grey,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        ),
        onTap: () => _openDetail(policy),
      ),
    );
  }
}

class _PolicyEditorSheet extends ConsumerStatefulWidget {
  final VoidCallback onSaved;

  const _PolicyEditorSheet({required this.onSaved});

  @override
  ConsumerState<_PolicyEditorSheet> createState() => _PolicyEditorSheetState();
}

class _PolicyEditorSheetState extends ConsumerState<_PolicyEditorSheet> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _categoryController = TextEditingController();
  final _contentController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _titleController.dispose();
    _categoryController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      await ref.read(policiesServiceProvider).createPolicy(
            title: _titleController.text.trim(),
            category: _categoryController.text.trim(),
            content: _contentController.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onSaved();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Policy created')),
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
                'Add Policy',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: 'Title'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Title is required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _categoryController,
                decoration: const InputDecoration(labelText: 'Category'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _contentController,
                maxLines: 10,
                decoration: const InputDecoration(
                  labelText: 'Content',
                  alignLabelWithHint: true,
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Content is required' : null,
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
                label: const Text('Create Policy'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PolicyDetailSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> policy;
  final bool isAdmin;
  final VoidCallback onChanged;

  const _PolicyDetailSheet({
    required this.policy,
    required this.isAdmin,
    required this.onChanged,
  });

  @override
  ConsumerState<_PolicyDetailSheet> createState() => _PolicyDetailSheetState();
}

class _PolicyDetailSheetState extends ConsumerState<_PolicyDetailSheet> {
  Map<String, dynamic>? _detail;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  final _titleController = TextEditingController();
  final _categoryController = TextEditingController();
  final _contentController = TextEditingController();
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _titleController.dispose();
    _categoryController.dispose();
    _contentController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final detail = await ref
          .read(policiesServiceProvider)
          .getPolicy(widget.policy['id'] as String);
      if (!mounted) return;
      setState(() {
        _detail = detail;
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

  void _startEdit() {
    final policy = _detail ?? widget.policy;
    _titleController.text = policy['title']?.toString() ?? '';
    _categoryController.text = policy['category']?.toString() ?? '';
    _contentController.text = policy['content']?.toString() ?? '';
    setState(() => _editing = true);
  }

  Future<void> _saveEdit() async {
    setState(() => _busy = true);
    try {
      await ref.read(policiesServiceProvider).updatePolicy(
            widget.policy['id'] as String,
            title: _titleController.text.trim(),
            category: _categoryController.text.trim(),
            content: _contentController.text.trim(),
          );
      if (!mounted) return;
      setState(() {
        _busy = false;
        _editing = false;
      });
      widget.onChanged();
      _load();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Policy updated')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Update failed: $e')),
      );
    }
  }

  Future<void> _toggleActive() async {
    final current = (_detail ?? widget.policy)['isActive'] != false;
    setState(() => _busy = true);
    try {
      await ref.read(policiesServiceProvider).updatePolicy(
            widget.policy['id'] as String,
            isActive: !current,
          );
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onChanged();
      _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Update failed: $e')),
      );
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete policy?'),
        content: Text('"${widget.policy['title']}" will be removed.'),
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
          .read(policiesServiceProvider)
          .deletePolicy(widget.policy['id'] as String);
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final policy = (_detail ?? widget.policy).cast<String, dynamic>();
    final active = policy['isActive'] != false;
    final documents = policy['documents'] as List? ?? const [];

    return DraggableScrollableSheet(
      initialChildSize: 0.8,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 48),
        children: [
          if (_editing) ...[
            Text('Edit Policy', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            TextField(
              controller: _titleController,
              decoration: const InputDecoration(labelText: 'Title'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _categoryController,
              decoration: const InputDecoration(labelText: 'Category'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _contentController,
              maxLines: 10,
              decoration: const InputDecoration(labelText: 'Content', alignLabelWithHint: true),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                OutlinedButton(
                  onPressed: _busy ? null : () => setState(() => _editing = false),
                  child: const Text('Cancel'),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  onPressed: _busy ? null : _saveEdit,
                  child: const Text('Save'),
                ),
              ],
            ),
          ] else ...[
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      policy['title']?.toString() ?? 'Untitled policy',
                      style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    Text(
                      [
                        policy['category']?.toString() ?? '',
                        'v${policy['version'] ?? 1}',
                        active ? 'Active' : 'Inactive',
                      ].where((v) => v.isNotEmpty).join(' · '),
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              if (widget.isAdmin)
                Switch(value: active, onChanged: _busy ? null : (_) => _toggleActive()),
            ],
          ),
          const SizedBox(height: 12),
          if (widget.isAdmin && !_editing)
            Row(
              children: [
                OutlinedButton.icon(
                  onPressed: _busy ? null : _startEdit,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Edit'),
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
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_error != null)
            Center(child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)))
          else ...[
            Text(policy['content']?.toString() ?? ''),
            if (documents.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Linked documents', style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: documents.map((link) {
                  final doc = (link as Map)['document'] as Map? ?? const {};
                  return Chip(
                    avatar: const Icon(Icons.insert_drive_file_outlined, size: 16),
                    label: Text(
                      doc['title']?.toString() ?? '—',
                      style: theme.textTheme.labelSmall,
                    ),
                    visualDensity: VisualDensity.compact,
                  );
                }).toList(),
              ),
            ],
          ],
          ],
        ],
      ),
    );
  }
}