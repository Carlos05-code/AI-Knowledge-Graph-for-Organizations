import 'dart:convert';
import 'dart:typed_data';
import 'api_client.dart';

class DocumentsService {
  final ApiClient _client;

  DocumentsService(this._client);

  Future<Map<String, dynamic>> listDocuments({
    int page = 1,
    int limit = 20,
    String? status,
  }) async {
    final res = await _client.get('/documents', queryParameters: {
      'page': page,
      'limit': limit,
      if (status != null && status.isNotEmpty) 'status': status,
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? raw : <String, dynamic>{};
    return body.cast<String, dynamic>();
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

  Future<Map<String, dynamic>> processDocument(String id) async {
    final res = await _client.post('/documents/$id/process');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> uploadDocument({
    required String fileName,
    required Uint8List bytes,
    required String mimeType,
  }) async {
    final res = await _client.upload('/upload', fileName: fileName, bytes: bytes, mimeType: mimeType);
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }
}
