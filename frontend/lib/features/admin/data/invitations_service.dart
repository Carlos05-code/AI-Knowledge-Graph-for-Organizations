import 'dart:convert';
import '../../../core/api/api_client.dart';

class InvitationsService {
  InvitationsService(this._client);

  final ApiClient _client;

  Future<Map<String, dynamic>> create({
    required String email,
    String role = 'USER',
    int? expiresInDays,
  }) async {
    final res = await _client.post('/invitations', data: {
      'email': email,
      'role': role,
      if (expiresInDays != null) 'expiresInDays': expiresInDays,
    });
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> list({
    int page = 1,
    int limit = 20,
    String? status,
  }) async {
    final res = await _client.get(
      '/invitations',
      queryParameters: {
        'page': page,
        'limit': limit,
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> revoke(String id) async {
    final res = await _client.post('/invitations/$id/revoke');
    return _unwrap(res.data);
  }

  Future<Map<String, dynamic>> accept({
    required String token,
    required String email,
    required String firstName,
    required String lastName,
    required String password,
  }) async {
    final res = await _client.post('/invitations/accept', data: {
      'token': token,
      'email': email,
      'firstName': firstName,
      'lastName': lastName,
      'password': password,
    });
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
