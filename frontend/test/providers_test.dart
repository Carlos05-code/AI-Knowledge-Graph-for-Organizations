import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:ai_knowledge_graph/core/api/api_client.dart';
import 'package:ai_knowledge_graph/core/api/chat_service.dart';
import 'package:ai_knowledge_graph/core/api/search_service.dart';
import 'package:ai_knowledge_graph/core/api/api_providers.dart';
import 'package:ai_knowledge_graph/features/admin/data/invitations_service.dart';
import 'package:ai_knowledge_graph/features/admin/presentation/invitations_provider.dart';
import 'package:ai_knowledge_graph/features/chat/presentation/chat_provider.dart';
import 'package:ai_knowledge_graph/features/search/presentation/search_provider.dart';
import 'package:ai_knowledge_graph/features/notifications/data/notifications_service.dart';
import 'package:ai_knowledge_graph/features/notifications/presentation/notifications_provider.dart';

void main() {
  group('SearchNotifier', () {
    test('defaults to hybrid mode', () {
      final container = ProviderContainer(
        overrides: [
          searchServiceProvider.overrideWithValue(FakeSearchService()),
        ],
      );
      addTearDown(container.dispose);

      expect(container.read(searchProvider).mode, 'hybrid');
      expect(container.read(searchProvider).query, '');
    });

    test('hybrid search merges documents, people and graph results', () async {
      final container = ProviderContainer(
        overrides: [
          searchServiceProvider.overrideWithValue(FakeSearchService()),
        ],
      );
      addTearDown(container.dispose);

      container.read(searchProvider.notifier).setQuery('kubernetes');
      await container.read(searchProvider.notifier).search();

      final state = container.read(searchProvider);
      expect(state.isLoading, false);
      expect(state.results.length, 3);
      expect(
        state.results.map((r) => r['title']),
        containsAll(['Doc A', 'Person B', 'Entity C']),
      );
    });

    test('keyword mode returns direct results', () async {
      final container = ProviderContainer(
        overrides: [
          searchServiceProvider.overrideWithValue(FakeSearchService()),
        ],
      );
      addTearDown(container.dispose);

      container.read(searchProvider.notifier).setQuery('slack');
      container.read(searchProvider.notifier).setMode('keyword');
      await container.read(searchProvider.notifier).search();

      final state = container.read(searchProvider);
      expect(state.results.length, 1);
      expect(state.results.single['title'], 'Doc A');
    });

    test('empty query clears results without loading', () async {
      final container = ProviderContainer(
        overrides: [
          searchServiceProvider.overrideWithValue(FakeSearchService()),
        ],
      );
      addTearDown(container.dispose);

      await container.read(searchProvider.notifier).search();

      final state = container.read(searchProvider);
      expect(state.isLoading, false);
      expect(state.results, isEmpty);
    });

    test('service failure surfaces error', () async {
      final failing = FakeSearchService()..failNext = true;
      final container = ProviderContainer(
        overrides: [searchServiceProvider.overrideWithValue(failing)],
      );
      addTearDown(container.dispose);

      container.read(searchProvider.notifier).setQuery('boom');
      await container.read(searchProvider.notifier).search();

      final state = container.read(searchProvider);
      expect(state.isLoading, false);
      expect(state.error, isNotNull);
    });
  });

  group('ChatNotifier', () {
    test(
      'new conversation appends user message then assistant reply with sources',
      () async {
        final container = ProviderContainer(
          overrides: [chatServiceProvider.overrideWithValue(FakeChatService())],
        );
        addTearDown(container.dispose);

        await container
            .read(chatProvider.notifier)
            .sendMessage('What is the policy?');

        final state = container.read(chatProvider);
        expect(state.isSending, false);
        expect(state.conversationId, 'conv-1');
        expect(state.messages.length, 2);
        expect(state.messages.first['role'], 'user');
        expect(state.messages.first['content'], 'What is the policy?');
        expect(state.messages.last['role'], 'assistant');
        expect((state.messages.last['sources'] as List).length, 1);
      },
    );

    test('loadConversation replaces messages', () async {
      final container = ProviderContainer(
        overrides: [chatServiceProvider.overrideWithValue(FakeChatService())],
      );
      addTearDown(container.dispose);

      await container.read(chatProvider.notifier).loadConversation('conv-9');

      final state = container.read(chatProvider);
      expect(state.isLoading, false);
      expect(state.conversationId, 'conv-9');
      expect(state.messages.length, 2);
    });

    test(
      'send failure appends error message and clears sending flag',
      () async {
        final failing = FakeChatService()..failNext = true;
        final container = ProviderContainer(
          overrides: [chatServiceProvider.overrideWithValue(failing)],
        );
        addTearDown(container.dispose);

        await container.read(chatProvider.notifier).sendMessage('hi');

        final state = container.read(chatProvider);
        expect(state.isSending, false);
        expect(state.messages.last['isError'], true);
        expect(state.error, isNotNull);
      },
    );
  });

  group('NotificationsNotifier', () {
    test('refreshUnread loads count from service', () async {
      final container = ProviderContainer(
        overrides: [
          notificationsServiceProvider.overrideWithValue(
            FakeNotificationsService(),
          ),
        ],
      );
      addTearDown(container.dispose);

      await container.read(notificationsProvider.notifier).refreshUnread();
      expect(container.read(notificationsProvider).unreadCount, 3);
      expect(container.read(notificationsProvider).loading, false);
    });

    test('decrement never goes below zero', () async {
      final container = ProviderContainer(
        overrides: [
          notificationsServiceProvider.overrideWithValue(
            FakeNotificationsService(),
          ),
        ],
      );
      addTearDown(container.dispose);

      await container.read(notificationsProvider.notifier).refreshUnread();
      container.read(notificationsProvider.notifier).decrement();
      container.read(notificationsProvider.notifier).decrement(10);

      expect(container.read(notificationsProvider).unreadCount, 0);
    });

    test('clear resets count', () async {
      final container = ProviderContainer(
        overrides: [
          notificationsServiceProvider.overrideWithValue(
            FakeNotificationsService(),
          ),
        ],
      );
      addTearDown(container.dispose);

      await container.read(notificationsProvider.notifier).refreshUnread();
      container.read(notificationsProvider.notifier).clear();

      expect(container.read(notificationsProvider).unreadCount, 0);
    });
  });

  group('InvitationsNotifier', () {
    test('load fetches pending invitations', () async {
      final container = ProviderContainer(
        overrides: [
          invitationsServiceProvider
              .overrideWithValue(FakeInvitationsService()),
        ],
      );
      addTearDown(container.dispose);

      await container.read(invitationsProvider.notifier).load();

      final state = container.read(invitationsProvider);
      expect(state.loading, false);
      expect(state.invitations.length, 1);
      expect(state.invitations.first['email'], 'jane@company.com');
    });

    test('invite sends invitation and refreshes the list', () async {
      final container = ProviderContainer(
        overrides: [
          invitationsServiceProvider
              .overrideWithValue(FakeInvitationsService()),
        ],
      );
      addTearDown(container.dispose);

      final ok = await container
          .read(invitationsProvider.notifier)
          .invite('bob@company.com', 'VIEWER');

      expect(ok, true);
      expect(container.read(invitationsProvider).error, null);
      expect(container.read(invitationsProvider).invitations.length, 2);
    });

    test('invite failure surfaces error', () async {
      final fake = FakeInvitationsService()..failInvite = true;
      final container = ProviderContainer(
        overrides: [invitationsServiceProvider.overrideWithValue(fake)],
      );
      addTearDown(container.dispose);

      final ok = await container
          .read(invitationsProvider.notifier)
          .invite('bob@company.com', 'USER');

      expect(ok, false);
      expect(container.read(invitationsProvider).error, contains('failed'));
    });

    test('revoke removes a pending invitation', () async {
      final container = ProviderContainer(
        overrides: [
          invitationsServiceProvider
              .overrideWithValue(FakeInvitationsService()),
        ],
      );
      addTearDown(container.dispose);

      final ok =
          await container.read(invitationsProvider.notifier).revoke('inv-1');

      expect(ok, true);
      expect(
        container.read(invitationsProvider).invitations.map((i) => i['id']),
        isNot(contains('inv-1')),
      );
    });
  });
}

class FakeSearchService extends SearchService {
  FakeSearchService() : super(ApiClient());
  bool failNext = false;

  @override
  Future<List<Map<String, dynamic>>> search(
    String query, {
    String mode = 'hybrid',
    int limit = 20,
  }) async {
    if (failNext) throw Exception('search failed');
    return [
      {'title': 'Doc A', 'type': 'document'},
    ];
  }

  @override
  Future<Map<String, dynamic>> hybridSearch(
    String query, {
    int limit = 20,
  }) async {
    if (failNext) throw Exception('search failed');
    return {
      'documents': [
        {'title': 'Doc A', 'type': 'document'},
      ],
      'people': [
        {'title': 'Person B', 'type': 'person'},
      ],
      'graph': [
        {'title': 'Entity C', 'type': 'graph'},
      ],
    };
  }
}

class FakeChatService extends ChatService {
  FakeChatService() : super(ApiClient());
  bool failNext = false;

  @override
  Future<Map<String, dynamic>> createConversation(String title) async {
    return {'id': 'conv-1'};
  }

  @override
  Future<List<Map<String, dynamic>>> getMessages(String conversationId) async {
    return [
      {'role': 'user', 'content': 'hi'},
      {'role': 'assistant', 'content': 'hello', 'sources': []},
    ];
  }

  @override
  Future<Map<String, dynamic>> sendMessage(
    String conversationId,
    String content,
  ) async {
    if (failNext) throw Exception('send failed');
    return {
      'message': {
        'role': 'assistant',
        'content': 'Here is the policy.',
        'sources': [
          {'title': 'Policy v1', 'id': 'p-1', 'type': 'document'},
        ],
      },
      'conversationId': conversationId,
    };
  }
}

class FakeNotificationsService extends NotificationsService {
  FakeNotificationsService() : super(ApiClient());

  @override
  Future<Map<String, dynamic>> list({
    int page = 1,
    int limit = 20,
    bool? unreadOnly,
  }) async {
    return {
      'data': [],
      'meta': {
        'total': 0,
        'page': 1,
        'limit': 20,
        'totalPages': 0,
        'hasNext': false,
      },
    };
  }

  @override
  Future<int> getUnreadCount() async => 3;

  @override
  Future<void> markAsRead(String id) async {}

  @override
  Future<void> markAllAsRead() async {}

  @override
  Future<void> delete(String id) async {}
}

class FakeInvitationsService extends InvitationsService {
  FakeInvitationsService() : super(ApiClient());
  bool failInvite = false;
  final List<Map<String, dynamic>> _invites = [
    {
      'id': 'inv-1',
      'email': 'jane@company.com',
      'role': 'USER',
      'status': 'PENDING',
      'expiresAt':
          DateTime.now().add(const Duration(days: 5)).toIso8601String(),
    },
  ];

  @override
  Future<Map<String, dynamic>> list({
    int page = 1,
    int limit = 20,
    String? status,
  }) async {
    return {
      'data': List.of(_invites),
      'meta': {'total': _invites.length, 'page': 1, 'limit': 20},
    };
  }

  @override
  Future<Map<String, dynamic>> create({
    required String email,
    String role = 'USER',
    int? expiresInDays,
  }) async {
    if (failInvite) throw Exception('invite failed');
    final invitation = {
      'id': 'inv-new-${_invites.length}',
      'email': email,
      'role': role,
      'status': 'PENDING',
      'expiresAt':
          DateTime.now().add(const Duration(days: 7)).toIso8601String(),
    };
    _invites.add(invitation);
    return invitation;
  }

  @override
  Future<Map<String, dynamic>> revoke(String id) async {
    _invites.removeWhere((i) => i['id'] == id);
    return {'id': id, 'status': 'REVOKED'};
  }
}
