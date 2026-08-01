import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_client.dart';
import 'auth_service.dart';
import 'chat_service.dart';
import 'search_service.dart';
import 'graph_service.dart';
import 'documents_service.dart';
import 'users_service.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(ref.watch(apiClientProvider));
});

final chatServiceProvider = Provider<ChatService>((ref) {
  return ChatService(ref.watch(apiClientProvider));
});

final searchServiceProvider = Provider<SearchService>((ref) {
  return SearchService(ref.watch(apiClientProvider));
});

final graphServiceProvider = Provider<GraphService>((ref) {
  return GraphService(ref.watch(apiClientProvider));
});

final documentsServiceProvider = Provider<DocumentsService>((ref) {
  return DocumentsService(ref.watch(apiClientProvider));
});

final usersServiceProvider = Provider<UsersService>((ref) {
  return UsersService(ref.watch(apiClientProvider));
});
