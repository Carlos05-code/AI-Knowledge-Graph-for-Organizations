import 'dart:convert';
import 'api_client.dart';

class GraphService {
  final ApiClient _client;

  GraphService(this._client);

  Future<List<Map<String, dynamic>>> searchEntities(String query, {int limit = 50}) async {
    final res = await _client.get('/graph/search', queryParameters: {'q': query, 'limit': limit.toString()});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getEntity(String id) async {
    final res = await _client.get('/graph/entities/$id');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<List<Map<String, dynamic>>> getSubgraph(List<String> entityIds, {int depth = 2}) async {
    final res = await _client.post('/graph/subgraph', data: {'entityIds': entityIds, 'depth': depth});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> explore(String query) async {
    final res = await _client.get('/graph/explore', queryParameters: {'q': query});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }
}
