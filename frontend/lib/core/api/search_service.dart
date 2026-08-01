import 'dart:convert';
import 'api_client.dart';

class SearchService {
  final ApiClient _client;

  SearchService(this._client);

  Future<List<Map<String, dynamic>>> search(String query, {String mode = 'hybrid', int limit = 20}) async {
    final res = await _client.get('/search', queryParameters: {'q': query, 'mode': mode, 'limit': limit.toString()});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> searchDocuments(String query, {int limit = 20}) async {
    final res = await _client.get('/search/documents', queryParameters: {'q': query, 'limit': limit.toString()});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<List<Map<String, dynamic>>> searchPeople(String query, {int limit = 10}) async {
    final res = await _client.get('/search/people', queryParameters: {'q': query, 'limit': limit.toString()});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> hybridSearch(String query, {int limit = 20}) async {
    final res = await _client.get('/search/hybrid', queryParameters: {'q': query, 'limit': limit.toString()});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }
}
