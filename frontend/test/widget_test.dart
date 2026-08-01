import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:ai_knowledge_graph/features/auth/presentation/login_screen.dart';

void main() {
  testWidgets('Login screen renders correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(home: const LoginScreen()),
    );

    expect(find.text('Sign in to your organization'), findsOneWidget);
    expect(find.text('Email'), findsOneWidget);
    expect(find.text('Password'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });

  testWidgets('Login screen validates empty fields', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(home: const LoginScreen()),
    );

    await tester.tap(find.text('Sign In'));
    await tester.pump();

    expect(find.text('Enter a valid email'), findsOneWidget);
  });
}
