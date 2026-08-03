import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:ai_knowledge_graph/features/auth/presentation/login_screen.dart';
import 'package:ai_knowledge_graph/features/auth/presentation/register_screen.dart';
import 'package:ai_knowledge_graph/features/admin/admin_screen.dart';
import 'package:ai_knowledge_graph/features/chat/presentation/chat_provider.dart';
import 'package:ai_knowledge_graph/features/chat/presentation/chat_screen.dart';
import 'package:ai_knowledge_graph/features/notifications/data/notifications_service.dart';
import 'package:ai_knowledge_graph/features/notifications/presentation/notifications_screen.dart';
import 'package:ai_knowledge_graph/features/notifications/presentation/notifications_provider.dart';
import 'package:ai_knowledge_graph/core/api/api_client.dart';
import 'package:ai_knowledge_graph/core/api/api_providers.dart';
import 'package:ai_knowledge_graph/features/auth/domain/auth_provider.dart';
import 'package:ai_knowledge_graph/features/auth/domain/auth_state.dart';

Widget _wrap(Widget child) {
  return ProviderScope(child: MaterialApp(home: child));
}

void main() {
  group('LoginScreen', () {
    testWidgets('renders correctly with ProviderScope', (tester) async {
      await tester.pumpWidget(_wrap(const LoginScreen()));

      expect(find.text('Sign in to your organization'), findsOneWidget);
      expect(find.text('Email'), findsOneWidget);
      expect(find.text('Password'), findsOneWidget);
      expect(find.text('Sign In'), findsOneWidget);
    });

    testWidgets('validates empty email', (tester) async {
      await tester.pumpWidget(_wrap(const LoginScreen()));

      await tester.tap(find.text('Sign In'));
      await tester.pump();

      expect(find.text('Enter a valid email'), findsOneWidget);
    });

    testWidgets('validates short password', (tester) async {
      await tester.pumpWidget(_wrap(const LoginScreen()));

      await tester.enterText(find.byType(TextField).first, 'admin@test.com');
      await tester.enterText(find.byType(TextField).at(1), 'short');
      await tester.tap(find.text('Sign In'));
      await tester.pump();

      expect(find.text('Minimum 8 characters'), findsOneWidget);
    });
  });

  group('RegisterScreen', () {
    testWidgets('renders correctly with ProviderScope', (tester) async {
      await tester.pumpWidget(_wrap(const RegisterScreen()));

      expect(find.text('Create your account'), findsOneWidget);
      expect(find.text('Create Account'), findsOneWidget);
    });
  });

  group('AdminScreen', () {
    testWidgets('locks non-admin users out', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            authProvider.overrideWith(
              (ref) => _FakeAuthNotifier(
                const Authenticated(
                  userId: 'u1',
                  email: 'viewer@test.com',
                  role: 'USER',
                ),
              ),
            ),
          ],
          child: const MaterialApp(home: AdminScreen()),
        ),
      );
      await tester.pump();

      expect(find.text('Administrator access required'), findsOneWidget);
    });
  });

  group('ChatScreen', () {
    testWidgets('renders citation chips with title', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [chatProvider.overrideWith((ref) => _FakeChatNotifier())],
          child: const MaterialApp(home: ChatScreen()),
        ),
      );
      await tester.pump();

      expect(find.text('Usage Policy rev 12'), findsOneWidget);
      expect(find.text('Sources'), findsOneWidget);

      await tester.tap(find.text('Usage Policy rev 12'));
      await tester.pumpAndSettle();

      expect(find.text('Citation'), findsOneWidget);
      expect(find.text('document'), findsOneWidget);
    });
  });

  group('NotificationsScreen', () {
    testWidgets('renders notifications and marks read on tap', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            notificationsServiceProvider.overrideWithValue(
              FakeNotificationsService(),
            ),
          ],
          child: const MaterialApp(home: NotificationsScreen()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('New policy published'), findsOneWidget);
      expect(find.text('Connector heartbeat'), findsOneWidget);

      await tester.tap(find.text('Sync completed'));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      final state = ProviderScope.containerOf(
        tester.element(find.byType(NotificationsScreen)),
      ).read(notificationsProvider);
      expect(state.unreadCount, 1);
    });
  });
}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(AuthState initial) : super(_stubService()) {
    state = initial;
  }

  static dynamic _stubService() => Object();
}

class _FakeChatNotifier extends ChatNotifier {
  _FakeChatNotifier() : super(Object()) {
    state = state.copyWith(
      messages: [
        {'role': 'user', 'content': 'What is the usage policy?'},
        {
          'role': 'assistant',
          'content': 'The usage policy is defined in the linked document.',
          'sources': [
            {'title': 'Usage Policy rev 12', 'id': 'doc-1', 'type': 'document'},
          ],
        },
      ],
    );
  }
}

class FakeNotificationsService extends NotificationsService {
  FakeNotificationsService() : super(ApiClient());
  int _read = 0;

  @override
  Future<Map<String, dynamic>> list({
    int page = 1,
    int limit = 20,
    bool? unreadOnly,
  }) async {
    return {
      'data': [
        {
          'id': 'n1',
          'type': 'POLICY_UPDATED',
          'title': 'New policy published',
          'message': 'The onboarding policy was updated.',
          'isRead': false,
          'createdAt': '2026-08-04T10:00:00Z',
        },
        {
          'id': 'n2',
          'type': 'SYNC_COMPLETED',
          'title': 'Sync completed',
          'message': 'Slack channel export finished.',
          'isRead': false,
          'createdAt': '2026-08-03T09:00:00Z',
        },
        {
          'id': 'n3',
          'type': 'CONNECTOR_FAILED',
          'title': 'Connector heartbeat',
          'message': 'GitHub adapter unreachable.',
          'isRead': true,
          'createdAt': '2026-08-02T08:00:00Z',
        },
      ],
      'meta': {
        'total': 3,
        'page': 1,
        'limit': 20,
        'totalPages': 1,
        'hasNext': false,
      },
    };
  }

  @override
  Future<int> getUnreadCount() async => 2 - _read;

  @override
  Future<void> markAsRead(String id) async {
    _read++;
  }

  @override
  Future<void> markAllAsRead() async {
    _read = 2;
  }

  @override
  Future<void> delete(String id) async {}
}
