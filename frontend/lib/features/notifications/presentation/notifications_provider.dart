import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import '../data/notifications_service.dart';

class NotificationsState {
  final int unreadCount;
  final bool loading;

  const NotificationsState({this.unreadCount = 0, this.loading = false});

  NotificationsState copyWith({int? unreadCount, bool? loading}) {
    return NotificationsState(
      unreadCount: unreadCount ?? this.unreadCount,
      loading: loading ?? this.loading,
    );
  }
}

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  final NotificationsService _service;

  NotificationsNotifier(this._service) : super(const NotificationsState());

  Future<void> refreshUnread() async {
    state = state.copyWith(loading: true);
    try {
      final count = await _service.getUnreadCount();
      state = NotificationsState(unreadCount: count, loading: false);
    } catch (_) {
      state = state.copyWith(loading: false);
    }
  }

  void decrement([int amount = 1]) {
    final updated = state.unreadCount - amount;
    state = state.copyWith(unreadCount: updated < 0 ? 0 : updated);
  }

  void clear() {
    state = state.copyWith(unreadCount: 0);
  }
}

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, NotificationsState>((ref) {
      return NotificationsNotifier(ref.watch(notificationsServiceProvider));
    });
