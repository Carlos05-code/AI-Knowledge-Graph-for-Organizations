import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/app_shell.dart';
import '../../features/auth/domain/auth_provider.dart';
import '../../features/auth/domain/auth_state.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/home/home_screen.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/search/presentation/search_screen.dart';
import '../../features/graph/presentation/graph_explorer_screen.dart';
import '../../features/shell/shell_placeholder.dart';
import '../../features/settings/settings_screen.dart';
import '../../features/admin/admin_screen.dart';
import '../../features/documents/documents_screen.dart';
import '../../features/connectors/presentation/connectors_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: true,
    redirect: (context, state) {
      final isAuthenticated = authState is Authenticated;
      final isAuthRoute = state.matchedLocation == '/login' || state.matchedLocation == '/register';

      if (!isAuthenticated && !isAuthRoute) return '/login';
      if (isAuthenticated && isAuthRoute) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (_, __) => const RegisterScreen(),
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
                builder: (_, state) => ChatScreen(conversationId: state.pathParameters['conversationId']),
              ),
            ],
          ),
          GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
          GoRoute(path: '/documents', builder: (_, __) => const DocumentsScreen()),
          GoRoute(path: '/graph', builder: (_, __) => const GraphExplorerScreen()),
          GoRoute(path: '/connectors', builder: (_, __) => const ConnectorsScreen()),
          GoRoute(path: '/meetings', builder: (_, __) => const ShellPlaceholder(title: 'Meetings', icon: Icons.meeting_room_outlined)),
          GoRoute(path: '/policies', builder: (_, __) => const ShellPlaceholder(title: 'Policies', icon: Icons.policy_outlined)),
          GoRoute(path: '/admin', builder: (_, __) => const AdminScreen()),
          GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
        ],
      ),
    ],
  );
});
