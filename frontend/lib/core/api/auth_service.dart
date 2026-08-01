import 'dart:convert';
import 'api_client.dart';

class AuthService {
  final ApiClient _client;

  AuthService(this._client);

  Future<Map<String, dynamic>> login(String email, String password) async {
    final res = await _client.post('/auth/login', data: {'email': email, 'password': password});
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    final result = body.cast<String, dynamic>();

    final accessToken = result['accessToken']?.toString() ?? result['access_token']?.toString() ?? '';
    final refreshToken = result['refreshToken']?.toString() ?? result['refresh_token']?.toString() ?? '';
    if (accessToken.isNotEmpty) {
      await _client.setTokens(access: accessToken, refresh: refreshToken);
    }

    return result;
  }

  Future<Map<String, dynamic>> register(String email, String password, String firstName, String lastName, {String? organizationName}) async {
    final res = await _client.post('/auth/register', data: {
      'email': email,
      'password': password,
      'firstName': firstName,
      'lastName': lastName,
      if (organizationName != null && organizationName.isNotEmpty) 'organizationName': organizationName,
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    final result = body.cast<String, dynamic>();

    final accessToken = result['accessToken']?.toString() ?? result['access_token']?.toString() ?? '';
    final refreshToken = result['refreshToken']?.toString() ?? result['refresh_token']?.toString() ?? '';
    if (accessToken.isNotEmpty) {
      await _client.setTokens(access: accessToken, refresh: refreshToken);
    }

    return result;
  }

  Future<Map<String, dynamic>> getProfile() async {
    final res = await _client.get('/auth/me');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<void> logout() async {
    await _client.clearTokens();
  }
}
