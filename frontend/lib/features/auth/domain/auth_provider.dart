import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';
import '../../../core/api/auth_service.dart';
import 'auth_state.dart';

class AuthNotifier extends StateNotifier<AuthState> {
  final AuthService _authService;

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

  Future<void> register(String email, String password, String firstName, String lastName, {String? organizationName}) async {
    state = const AuthLoading();
    try {
      final result = await _authService.register(email, password, firstName, lastName, organizationName: organizationName);
      state = Authenticated(
        userId: result['user']?['id'] ?? result['id'] ?? '',
        email: result['user']?['email'] ?? email,
        role: result['user']?['role'] ?? 'ADMIN',
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
