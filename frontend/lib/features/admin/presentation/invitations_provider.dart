import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import '../data/invitations_service.dart';

class InvitationsState {
  final List<Map<String, dynamic>> invitations;
  final bool loading;
  final String? error;

  const InvitationsState({
    this.invitations = const [],
    this.loading = false,
    this.error,
  });

  InvitationsState copyWith({
    List<Map<String, dynamic>>? invitations,
    bool? loading,
    String? error,
  }) {
    return InvitationsState(
      invitations: invitations ?? this.invitations,
      loading: loading ?? this.loading,
      error: error ?? this.error,
    );
  }
}

class InvitationsNotifier extends StateNotifier<InvitationsState> {
  final InvitationsService _service;

  InvitationsNotifier(this._service) : super(const InvitationsState());

  Future<void> load() async {
    state = state.copyWith(loading: true, error: null);
    try {
      final res = await _service.list(limit: 50, status: 'PENDING');
      state = InvitationsState(
        invitations: (res['data'] as List?)?.cast<Map<String, dynamic>>() ?? [],
        loading: false,
      );
    } catch (e) {
      state = state.copyWith(loading: false, error: e.toString());
    }
  }

  Future<bool> invite(String email, String role) async {
    try {
      await _service.create(email: email, role: role);
      await load();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }

  Future<bool> revoke(String id) async {
    try {
      await _service.revoke(id);
      await load();
      return true;
    } catch (e) {
      state = state.copyWith(error: e.toString());
      return false;
    }
  }
}

final invitationsProvider =
    StateNotifierProvider<InvitationsNotifier, InvitationsState>((ref) {
      return InvitationsNotifier(ref.watch(invitationsServiceProvider));
    });
