import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/app_shell.dart';
import '../../features/auth/domain/auth_provider.dart';
import '../../features/auth/domain/auth_state.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/accept_invitation_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/search/presentation/search_screen.dart';
import '../../features/graph/presentation/graph_explorer_screen.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/admin/admin_screen.dart';
import '../../features/documents/documents_screen.dart';
import '../../features/connectors/presentation/connectors_screen.dart';
import '../../features/meetings/presentation/meetings_screen.dart';
import '../../features/policies/presentation/policies_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: true,
    redirect: (context, state) {
      final isAuthenticated = authState is Authenticated;
      final isAuthRoute =
          state.matchedLocation == '/login' ||
          state.matchedLocation == '/register' ||
          state.matchedLocation.startsWith('/accept');

      if (!isAuthenticated && !isAuthRoute) return '/login';
      if (isAuthenticated && isAuthRoute) {
        if (state.matchedLocation.startsWith('/accept')) return null;
        return '/';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
      GoRoute(
        path: '/accept',
        builder: (_, state) => AcceptInvitationScreen(
          token: state.uri.queryParameters['token'] ?? '',
          email: state.uri.queryParameters['email'],
        ),
      ),
      ShellRoute(
        builder: (_, __, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
          GoRoute(
            path: '/chat',
            builder: (_, __) => const ChatScreen(),
            routes: [
              GoRoute(
                path: ':conversationId',
                builder: (_, state) => ChatScreen(
                  conversationId: state.pathParameters['conversationId'],
                ),
              ),
            ],
          ),
          GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
          GoRoute(
            path: '/documents',
            builder: (_, __) => const DocumentsScreen(),
          ),
          GoRoute(
            path: '/graph',
            builder: (_, __) => const GraphExplorerScreen(),
          ),
          GoRoute(
            path: '/connectors',
            builder: (_, __) => const ConnectorsScreen(),
          ),
          GoRoute(
            path: '/meetings',
            builder: (_, __) => const MeetingsScreen(),
          ),
          GoRoute(
            path: '/policies',
            builder: (_, __) => const PoliciesScreen(),
          ),
          GoRoute(
            path: '/notifications',
            builder: (_, __) => const NotificationsScreen(),
          ),
          GoRoute(path: '/admin', builder: (_, __) => const AdminScreen()),
          GoRoute(
            path: '/settings',
            builder: (_, __) => const SettingsScreen(),
          ),
        ],
      ),
    ],
  );
});
