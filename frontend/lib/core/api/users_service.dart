import 'dart:convert';
import 'api_client.dart';

class UsersService {
  final ApiClient _client;

  UsersService(this._client);

  Future<Map<String, dynamic>> getMe() async {
    final res = await _client.get('/users/me');
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> updateMe(Map<String, dynamic> data) async {
    final res = await _client.patch('/users/me', data: data);
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> listMembers({int page = 1, int limit = 50, String? query}) async {
    final res = await _client.get('/users', queryParameters: {
      'page': page,
      'limit': limit,
      if (query != null && query.isNotEmpty) 'q': query,
    });
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> updateMember(String id, Map<String, dynamic> data) async {
    final res = await _client.patch('/users/$id', data: data);
    return _unwrap(res.data);
  }

  Map<String, dynamic> _unwrap(dynamic raw) {
    final decoded = raw is String ? jsonDecode(raw) : raw;
    final body = decoded is Map ? (decoded['data'] ?? decoded) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }
}
