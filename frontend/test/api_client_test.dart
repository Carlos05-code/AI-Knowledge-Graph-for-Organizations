import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ai_knowledge_graph/core/api/api_client.dart';

void main() {
  group('extractErrorMessage', () {
    RequestOptions options() => RequestOptions(path: '/x');

    test('extracts the backend message field from a DioException response', () {
      final error = DioException(
        requestOptions: options(),
        response: Response(
          requestOptions: options(),
          statusCode: 400,
          data: {
            'success': false,
            'message': 'Meeting has no transcript to summarize',
            'timestamp': '2026-01-01T00:00:00Z',
          },
        ),
      );

      expect(
        extractErrorMessage(error),
        'Meeting has no transcript to summarize',
      );
    });

    test('joins a class-validator array message into one string', () {
      final error = DioException(
        requestOptions: options(),
        response: Response(
          requestOptions: options(),
          statusCode: 400,
          data: {
            'success': false,
            'message': ['title should not be empty', 'severity must be valid'],
          },
        ),
      );

      expect(
        extractErrorMessage(error),
        'title should not be empty, severity must be valid',
      );
    });

    test('falls back to the DioException message when there is no response body', () {
      final error = DioException(
        requestOptions: options(),
        type: DioExceptionType.connectionTimeout,
        message: 'Connection timed out',
      );

      expect(extractErrorMessage(error), 'Connection timed out');
    });

    test('falls back to toString for a non-Dio error', () {
      expect(extractErrorMessage(StateError('boom')), 'Bad state: boom');
    });
  });
}
