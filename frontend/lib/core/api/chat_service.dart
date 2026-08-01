import 'dart:convert';
import 'api_client.dart';

class ChatService {
  final ApiClient _client;

  ChatService(this._client);

  Future<Map<String, dynamic>> createConversation(String title) async {
    final res = await _client.post('/chat/conversations', data: {'title': title});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<List<Map<String, dynamic>>> getConversations() async {
    final res = await _client.get('/chat/conversations');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> getMessages(String conversationId) async {
    final res = await _client.get('/chat/conversations/$conversationId/messages');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> sendMessage(String conversationId, String content) async {
    final res = await _client.post('/chat/send', data: {'conversationId': conversationId, 'content': content});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }
}
