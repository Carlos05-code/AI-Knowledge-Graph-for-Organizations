import 'dart:convert';
import '../../../core/api/api_client.dart';

class ConnectorsService {
  final ApiClient _client;

  ConnectorsService(this._client);

  Future<List<Map<String, dynamic>>> listConnectors() async {
    final res = await _client.get('/connectors');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) : raw;
    if (body is List) {
      return body.map((e) => (e as Map).cast<String, dynamic>()).toList();
    }
    return [];
  }

  Future<Map<String, dynamic>> getConnector(String id) async {
    final res = await _client.get('/connectors/$id');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> createConnector({
    required String name,
    required String type,
    required String credentials,
    Map<String, dynamic>? config,
    int? syncInterval,
  }) async {
    final res = await _client.post('/connectors', data: {
      'name': name,
      'type': type,
      'credentials': credentials,
      if (config != null && config.isNotEmpty) 'config': config,
      if (syncInterval != null) 'syncInterval': syncInterval,
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> updateConnector(
    String id, {
    String? name,
    String? credentials,
    Map<String, dynamic>? config,
    bool? isEnabled,
    int? syncInterval,
  }) async {
    final res = await _client.put('/connectors/$id', data: {
      if (name != null) 'name': name,
      if (credentials != null) 'credentials': credentials,
      if (config != null) 'config': config,
      if (isEnabled != null) 'isEnabled': isEnabled,
      if (syncInterval != null) 'syncInterval': syncInterval,
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<void> deleteConnector(String id) async {
    await _client.delete('/connectors/$id');
  }

  Future<Map<String, dynamic>> testConnector(String id) async {
    final res = await _client.post('/connectors/$id/test');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> syncConnector(String id) async {
    final res = await _client.post('/connectors/$id/sync');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<List<Map<String, dynamic>>> getRuns(String id) async {
    final res = await _client.get('/connectors/$id/runs');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) : raw;
    if (body is List) {
      return body.map((e) => (e as Map).cast<String, dynamic>()).toList();
    }
    return [];
  }
}