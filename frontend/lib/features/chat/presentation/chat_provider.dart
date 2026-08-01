import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';

class ChatState {
  final List<Map<String, dynamic>> messages;
  final String? conversationId;
  final bool isLoading;
  final bool isSending;
  final String? error;

  const ChatState({
    this.messages = const [],
    this.conversationId,
    this.isLoading = false,
    this.isSending = false,
    this.error,
  });

  ChatState copyWith({
    List<Map<String, dynamic>>? messages,
    String? conversationId,
    bool? isLoading,
    bool? isSending,
    String? error,
  }) {
    return ChatState(
      messages: messages ?? this.messages,
      conversationId: conversationId ?? this.conversationId,
      isLoading: isLoading ?? this.isLoading,
      isSending: isSending ?? this.isSending,
      error: error,
    );
  }
}

class ChatNotifier extends StateNotifier<ChatState> {
  final _chatService;

  ChatNotifier(this._chatService) : super(const ChatState());

  Future<void> loadConversation(String conversationId) async {
    state = state.copyWith(isLoading: true);
    try {
      final messages = await _chatService.getMessages(conversationId);
      state = state.copyWith(isLoading: false, conversationId: conversationId, messages: messages);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> sendMessage(String content) async {
    final text = content.trim();
    if (text.isEmpty) return;

    final userMsg = {'role': 'user', 'content': text, 'createdAt': DateTime.now().toIso8601String()};
    state = state.copyWith(
      messages: [...state.messages, userMsg],
      isSending: true,
    );

    try {
      if (state.conversationId == null) {
        final conv = await _chatService.createConversation(text.substring(0, text.length.clamp(0, 80)));
        final convId = conv['id'] as String;
        final result = await _chatService.sendMessage(convId, text);
        final reply = result['message'] ?? result;
        state = state.copyWith(
          conversationId: convId,
          messages: [...state.messages, reply is Map<String, dynamic> ? reply : {'role': 'assistant', 'content': reply.toString()}],
          isSending: false,
        );
      } else {
        final result = await _chatService.sendMessage(state.conversationId!, text);
        final reply = result['message'] ?? result;
        state = state.copyWith(
          messages: [...state.messages, reply is Map<String, dynamic> ? reply : {'role': 'assistant', 'content': reply.toString()}],
          isSending: false,
        );
      }
    } catch (e) {
      state = state.copyWith(
        messages: [...state.messages, {'role': 'assistant', 'content': 'Error: ${e.toString()}', 'isError': true}],
        isSending: false,
        error: e.toString(),
      );
    }
  }
}

final chatProvider = StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(ref.watch(chatServiceProvider));
});
