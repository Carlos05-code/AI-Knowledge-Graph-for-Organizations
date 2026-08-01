import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import 'auth_state.dart';

class AuthNotifier extends StateNotifier<AuthState> {
  final _authService;

  AuthNotifier(this._authService) : super(const AuthInitial());

  Future<void> login(String email, String password) async {
    state = const AuthLoading();
    try {
      final result = await _authService.login(email, password);
      state = Authenticated(
        userId: result['user']?['id'] ?? result['id'] ?? '',
        email: result['user']?['email'] ?? email,
        role: result['user']?['role'] ?? 'USER',
      );
    } catch (e) {
      state = Unauthenticated(error: e.toString());
    }
  }

  Future<void> checkAuth() async {
    try {
      final profile = await _authService.getProfile();
      state = Authenticated(
        userId: profile['id'] ?? '',
        email: profile['email'] ?? '',
        role: profile['role'] ?? 'USER',
      );
    } catch (_) {
      state = const Unauthenticated();
    }
  }

  Future<void> logout() async {
    await _authService.logout();
    state = const Unauthenticated();
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authServiceProvider));
});
