import 'dart:convert';
import '../../../core/api/api_client.dart';

class NotificationsService {
  NotificationsService(this._client);

  final ApiClient _client;

  Future<Map<String, dynamic>> list({
    int page = 1,
    int limit = 20,
    bool? unreadOnly,
  }) async {
    final res = await _client.get(
      '/notifications',
      queryParameters: {
        'page': page,
        'limit': limit,
        if (unreadOnly != null) 'unreadOnly': unreadOnly,
      },
    );
    return _unwrap(res.data);
  }

  Future<int> getUnreadCount() async {
    final res = await _client.get('/notifications/unread-count');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final value = raw is Map ? (raw['data'] ?? raw['count'] ?? 0) : (raw ?? 0);
    return int.tryParse(value.toString()) ?? 0;
  }

  Future<void> markAsRead(String id) async {
    await _client.post('/notifications/$id/read');
  }

  Future<void> markAllAsRead() async {
    await _client.post('/notifications/read-all');
  }

  Future<void> delete(String id) async {
    await _client.delete('/notifications/$id');
  }

  Map<String, dynamic> _unwrap(dynamic raw) {
    final decoded = raw is String ? jsonDecode(raw) : raw;
    final body = decoded is Map
        ? (decoded['data'] ?? decoded) as Map
        : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }
}
