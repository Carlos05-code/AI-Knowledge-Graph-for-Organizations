import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import '../auth/domain/auth_provider.dart';
import '../auth/domain/auth_state.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _titleController = TextEditingController();
  final _departmentController = TextEditingController();

  Map<String, dynamic>? _profile;
  String? _error;
  bool _loading = true;
  bool _saving = false;
  String? _savedMessage;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _titleController.dispose();
    _departmentController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await ref.read(usersServiceProvider).getMe();
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _firstNameController.text = profile['firstName']?.toString() ?? '';
        _lastNameController.text = profile['lastName']?.toString() ?? '';
        _titleController.text = profile['title']?.toString() ?? '';
        _departmentController.text = profile['department']?.toString() ?? '';
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

  String _initials() {
    final first = _profile?['firstName']?.toString() ?? '';
    final last = _profile?['lastName']?.toString() ?? '';
    return '${first.isNotEmpty ? first[0] : '?'}${last.isNotEmpty ? last[0] : ''}';
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _savedMessage = null;
    });
    try {
      final profile = await ref.read(usersServiceProvider).updateMe({
        'firstName': _firstNameController.text.trim(),
        'lastName': _lastNameController.text.trim(),
        'title': _titleController.text.trim(),
        'department': _departmentController.text.trim(),
      });
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _saving = false;
        _savedMessage = 'Profile updated';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final authState = ref.watch(authProvider);
    final role = authState is Authenticated ? authState.role : _profile?['role']?.toString() ?? '';

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _profile == null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Could not load profile', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(_error!, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      FilledButton(onPressed: _loadProfile, child: const Text('Retry')),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(24),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 560),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              CircleAvatar(
                                radius: 28,
                                child: Text(
                                  _initials(),
                                  style: theme.textTheme.titleLarge,
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(_profile?['email']?.toString() ?? '', style: theme.textTheme.titleMedium),
                                    const SizedBox(height: 4),
                                    Text(
                                      [role, _profile?['organization']?['name']?.toString()]
                                          .whereType<String>()
                                          .where((v) => v.isNotEmpty)
                                          .join(' · '),
                                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 24),
                          Row(
                            children: [
                              Expanded(
                                child: TextFormField(
                                  controller: _firstNameController,
                                  decoration: const InputDecoration(labelText: 'First name'),
                                  validator: (v) => (v?.trim().isEmpty ?? true) ? 'Required' : null,
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: TextFormField(
                                  controller: _lastNameController,
                                  decoration: const InputDecoration(labelText: 'Last name'),
                                  validator: (v) => (v?.trim().isEmpty ?? true) ? 'Required' : null,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _titleController,
                            decoration: const InputDecoration(labelText: 'Job title'),
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _departmentController,
                            decoration: const InputDecoration(labelText: 'Department'),
                          ),
                          const SizedBox(height: 24),
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                            ),
                          if (_savedMessage != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Text(_savedMessage!, style: TextStyle(color: theme.colorScheme.primary)),
                            ),
                          FilledButton.icon(
                            onPressed: _saving ? null : _save,
                            icon: _saving
                                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.save_outlined),
                            label: const Text('Save changes'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
    );
  }
}
