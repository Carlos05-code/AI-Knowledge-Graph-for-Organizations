import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_providers.dart';
import 'notifications_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  List<Map<String, dynamic>> _items = [];
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
      final result = await ref.read(notificationsServiceProvider).list();
      if (!mounted) return;
      setState(() {
        _items = (result['data'] as List? ?? [])
            .map((n) => (n as Map).cast<String, dynamic>())
            .toList();
        _loading = false;
      });
      await ref.read(notificationsProvider.notifier).refreshUnread();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _markRead(Map<String, dynamic> notification) async {
    final id = notification['id'] as String;
    final wasUnread = notification['isRead'] != true;
    try {
      await ref.read(notificationsServiceProvider).markAsRead(id);
      if (!mounted) return;
      setState(() {
        for (var i = 0; i < _items.length; i++) {
          if (_items[i]['id'] == id) _items[i]['isRead'] = true;
        }
      });
      if (wasUnread) ref.read(notificationsProvider.notifier).decrement();
    } catch (_) {
      // ignore offline failures
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = _items;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          IconButton(
            tooltip: 'Mark all as read',
            onPressed: _loading ? null : () => _markAllRead(),
            icon: const Icon(Icons.done_all),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    _error!,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton(onPressed: _load, child: const Text('Retry')),
                ],
              ),
            )
          : items.isEmpty
          ? const Center(child: Text('You are all caught up'))
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                final item = items[index];
                final unread = item['isRead'] != true;
                return Dismissible(
                  key: ValueKey(item['id']),
                  direction: DismissDirection.endToStart,
                  background: Container(
                    alignment: Alignment.centerRight,
                    padding: const EdgeInsets.only(right: 20),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      Icons.delete_outline,
                      color: theme.colorScheme.onErrorContainer,
                    ),
                  ),
                  onDismissed: (_) => _delete(item),
                  child: Card(
                    margin: EdgeInsets.zero,
                    child: ListTile(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      leading: CircleAvatar(
                        backgroundColor: unread
                            ? theme.colorScheme.primaryContainer
                            : theme.colorScheme.surfaceContainerHighest,
                        child: Icon(
                          _typeIcon(item['type']),
                          size: 18,
                          color: unread
                              ? theme.colorScheme.primary
                              : theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      title: Text(
                        item['title']?.toString() ?? 'Notification',
                        style: TextStyle(
                          fontWeight: unread
                              ? FontWeight.w600
                              : FontWeight.w400,
                        ),
                      ),
                      subtitle: Text(
                        item['message']?.toString() ?? '',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _formatTime(item['createdAt']),
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (unread)
                            Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primary,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                      onTap: unread ? () => _markRead(item) : null,
                    ),
                  ),
                );
              },
            ),
    );
  }

  Future<void> _markAllRead() async {
    try {
      await ref.read(notificationsServiceProvider).markAllAsRead();
      if (!mounted) return;
      setState(() {
        for (var i = 0; i < _items.length; i++) {
          _items[i]['isRead'] = true;
        }
      });
      ref.read(notificationsProvider.notifier).clear();
    } catch (_) {}
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    final id = item['id'] as String;
    try {
      await ref.read(notificationsServiceProvider).delete(id);
      if (!mounted) return;
      setState(() {
        _items = _items.where((n) => n['id'] != id).toList();
      });
      if (item['isRead'] != true) {
        ref.read(notificationsProvider.notifier).decrement();
      }
    } catch (_) {
      _load();
    }
  }

  IconData _typeIcon(Object? type) {
    switch (type?.toString()) {
      case 'DOCUMENT_CHANGED':
        return Icons.description_outlined;
      case 'POLICY_UPDATED':
        return Icons.policy_outlined;
      case 'CONNECTOR_FAILED':
        return Icons.error_outline;
      case 'SYNC_COMPLETED':
        return Icons.cloud_done_outlined;
      case 'AI_CONFIDENCE_LOW':
        return Icons.psychology_outlined;
      default:
        return Icons.notifications_outlined;
    }
  }
}

String _formatTime(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  try {
    return DateFormat('MMM d, HH:mm').format(DateTime.parse(iso).toLocal());
  } catch (_) {
    return iso;
  }
}
