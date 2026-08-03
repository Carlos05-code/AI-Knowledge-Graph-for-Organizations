import 'dart:convert';
import '../../../core/api/api_client.dart';

class PoliciesService {
  PoliciesService(this._client);

  final ApiClient _client;

  Future<Map<String, dynamic>> listPolicies({
    int page = 1,
    int limit = 20,
    String? category,
    bool? active,
  }) async {
    final res = await _client.get('/policies', queryParameters: {
      'page': page,
      'limit': limit,
      if (category != null && category.isNotEmpty) 'category': category,
      if (active != null) 'active': active,
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<List<Map<String, dynamic>>> searchPolicies(String query) async {
    if (query.trim().isEmpty) return [];
    final res = await _client.get('/policies/search', queryParameters: {'q': query});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) : raw;
    if (body is List) {
      return body.map((e) => (e as Map).cast<String, dynamic>()).toList();
    }
    return [];
  }

  Future<Map<String, dynamic>> getPolicy(String id) async {
    final res = await _client.get('/policies/$id');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> createPolicy({
    required String title,
    required String content,
    String? category,
    DateTime? effectiveDate,
    DateTime? expirationDate,
  }) async {
    final res = await _client.post('/policies', data: {
      'title': title,
      'content': content,
      if (category != null && category.isNotEmpty) 'category': category,
      if (effectiveDate != null) 'effectiveDate': effectiveDate.toIso8601String(),
      if (expirationDate != null) 'expirationDate': expirationDate.toIso8601String(),
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> updatePolicy(
    String id, {
    String? title,
    String? content,
    String? category,
    bool? isActive,
    DateTime? effectiveDate,
    DateTime? expirationDate,
  }) async {
    final res = await _client.put('/policies/$id', data: {
      if (title != null) 'title': title,
      if (content != null) 'content': content,
      if (category != null) 'category': category,
      if (isActive != null) 'isActive': isActive,
      if (effectiveDate != null) 'effectiveDate': effectiveDate.toIso8601String(),
      if (expirationDate != null) 'expirationDate': expirationDate.toIso8601String(),
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<void> deletePolicy(String id) async {
    await _client.delete('/policies/$id');
  }
}