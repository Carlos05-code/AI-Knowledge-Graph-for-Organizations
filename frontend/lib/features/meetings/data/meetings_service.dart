import 'dart:convert';
import '../../../core/api/api_client.dart';

class MeetingsService {
  MeetingsService(this._client);

  final ApiClient _client;

  Future<Map<String, dynamic>> listMeetings({
    int page = 1,
    int limit = 20,
  }) async {
    final res = await _client.get('/meetings', queryParameters: {
      'page': page,
      'limit': limit,
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> getMeeting(String id) async {
    final res = await _client.get('/meetings/$id');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> createMeeting({
    required String title,
    String? description,
    required DateTime meetingDate,
    int? duration,
    String? transcript,
  }) async {
    final res = await _client.post('/meetings', data: {
      'title': title,
      if (description != null && description.isNotEmpty)
        'description': description,
      'meetingDate': meetingDate.toIso8601String(),
      if (duration != null) 'duration': duration,
      if (transcript != null && transcript.isNotEmpty) 'transcript': transcript,
    });
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<Map<String, dynamic>> summarizeMeeting(String id) async {
    final res = await _client.post('/meetings/$id/summarize');
    final raw = res.data is String ? jsonDecode(res.data as String) : res.data;
    final body = raw is Map ? (raw['data'] ?? raw) as Map : <String, dynamic>{};
    return body.cast<String, dynamic>();
  }

  Future<void> deleteMeeting(String id) async {
    await _client.delete('/meetings/$id');
  }
}