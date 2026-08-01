import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';

class SearchState {
  final String query;
  final String mode;
  final List<Map<String, dynamic>> results;
  final bool isLoading;
  final String? error;

  const SearchState({
    this.query = '',
    this.mode = 'hybrid',
    this.results = const [],
    this.isLoading = false,
    this.error,
  });

  SearchState copyWith({
    String? query,
    String? mode,
    List<Map<String, dynamic>>? results,
    bool? isLoading,
    String? error,
  }) {
    return SearchState(
      query: query ?? this.query,
      mode: mode ?? this.mode,
      results: results ?? this.results,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class SearchNotifier extends StateNotifier<SearchState> {
  final _searchService;

  SearchNotifier(this._searchService) : super(const SearchState());

  void setQuery(String query) {
    state = state.copyWith(query: query);
  }

  void setMode(String mode) {
    state = state.copyWith(mode: mode);
  }

  Future<void> search() async {
    if (state.query.trim().isEmpty) {
      state = state.copyWith(results: []);
      return;
    }
    state = state.copyWith(isLoading: true);
    try {
      if (state.mode == 'hybrid') {
        final result = await _searchService.hybridSearch(state.query);
        final docs = (result['documents'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        final people = (result['people'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        final graph = (result['graph'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        state = state.copyWith(isLoading: false, results: [...docs, ...people, ...graph]);
      } else {
        final results = await _searchService.search(state.query, mode: state.mode);
        state = state.copyWith(isLoading: false, results: results);
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }
}

final searchProvider = StateNotifierProvider<SearchNotifier, SearchState>((ref) {
  return SearchNotifier(ref.watch(searchServiceProvider));
});
