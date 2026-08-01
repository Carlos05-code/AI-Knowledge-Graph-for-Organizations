sealed class AuthState {
  const AuthState();
}

class AuthInitial extends AuthState {
  const AuthInitial();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class Authenticated extends AuthState {
  final String userId;
  final String email;
  final String role;
  const Authenticated({required this.userId, required this.email, required this.role});
}

class Unauthenticated extends AuthState {
  final String? error;
  const Unauthenticated({this.error});
}
