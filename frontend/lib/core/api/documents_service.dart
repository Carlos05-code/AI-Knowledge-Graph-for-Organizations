import 'dart:convert';
import 'api_client.dart';

class DocumentsService {
  final ApiClient _client;

  DocumentsService(this._client);

  Future<List<Map<String, dynamic>>> getDocuments({int skip = 0, int take = 20}) async {
    final res = await _client.get('/documents', queryParameters: {'skip': skip.toString(), 'take': take.toString()});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final list = raw is Map ? (raw['data'] ?? raw) : raw;
    return (list is List ? list : []).cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> getDocument(String id) async {
    final res = await _client.get('/documents/$id');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<void> deleteDocument(String id) async {
    await _client.delete('/documents/$id');
  }
}
