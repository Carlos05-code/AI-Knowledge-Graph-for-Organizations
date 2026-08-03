import 'dart:convert';
import '../../../core/api/api_client.dart';

class AdminService {
  AdminService(this._client);

  final ApiClient _client;

  Future<Map<String, dynamic>> getDashboard() async {
    final res = await _client.get('/admin/dashboard');
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> getAuditLogs({
    int page = 1,
    int limit = 20,
    String? entity,
    String? action,
  }) async {
    final res = await _client.get(
      '/admin/audit-logs',
      queryParameters: {
        'page': page,
        'limit': limit,
        if (entity != null && entity.isNotEmpty) 'entity': entity,
        if (action != null && action.isNotEmpty) 'action': action,
      },
    );
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> getHealth() async {
    final res = await _client.get('/admin/health');
    return _unwrap(res.data);
  }

  Map<String, dynamic> _unwrap(dynamic raw) {
    final decoded = raw is String ? jsonDecode(raw) : raw;
    final body = decoded is Map
        ? (decoded['data'] ?? decoded) as Map
        : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }
}
