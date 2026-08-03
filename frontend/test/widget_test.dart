import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:ai_knowledge_graph/features/auth/presentation/login_screen.dart';
import 'package:ai_knowledge_graph/features/auth/presentation/register_screen.dart';
import 'package:ai_knowledge_graph/features/admin/admin_screen.dart';
import 'package:ai_knowledge_graph/features/chat/presentation/chat_provider.dart';
import 'package:ai_knowledge_graph/features/chat/presentation/chat_screen.dart';
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
