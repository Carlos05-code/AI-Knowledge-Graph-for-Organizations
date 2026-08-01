import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'search_provider.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _performSearch() {
    ref.read(searchProvider.notifier).search();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(searchProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Enterprise Search')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                TextField(
                  controller: _controller,
                  decoration: InputDecoration(
                    hintText: 'Search documents, people, topics...',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _controller.text.isNotEmpty
                        ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _controller.clear(); ref.read(searchProvider.notifier).setQuery(''); ref.read(searchProvider.notifier).search(); })
                        : null,
                  ),
                  onChanged: (v) => ref.read(searchProvider.notifier).setQuery(v),
                  onSubmitted: (_) => _performSearch(),
                  textInputAction: TextInputAction.search,
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    _ModeChip(label: 'Hybrid', value: 'hybrid', selected: state.mode == 'hybrid', onSelected: (v) { ref.read(searchProvider.notifier).setMode(v); _performSearch(); }),
                    const SizedBox(width: 8),
                    _ModeChip(label: 'Keyword', value: 'keyword', selected: state.mode == 'keyword', onSelected: (v) { ref.read(searchProvider.notifier).setMode(v); _performSearch(); }),
                    const SizedBox(width: 8),
                    _ModeChip(label: 'Semantic', value: 'semantic', selected: state.mode == 'semantic', onSelected: (v) { ref.read(searchProvider.notifier).setMode(v); _performSearch(); }),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: state.query.isEmpty
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.search_off, size: 64, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5)),
                        const SizedBox(height: 16),
                        Text('Search across all your organization\'s knowledge', style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                      ],
                    ),
                  )
                : state.isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : state.results.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.search_off, size: 64, color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5)),
                                const SizedBox(height: 16),
                                Text('No results found for "${state.query}"', style: theme.textTheme.titleMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                              ],
                            ),
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            itemCount: state.results.length,
                            itemBuilder: (_, i) {
                              final item = state.results[i];
                              final score = item['score'];
                              final title = item['title']?.toString() ?? item['name']?.toString() ?? 'Untitled';
                              final description = item['description']?.toString() ?? item['content']?.toString() ?? item['summary']?.toString() ?? '';
                              final type = item['type']?.toString() ?? item['entityType']?.toString() ?? 'document';
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: ListTile(
                                  leading: Icon(_iconForType(type)),
                                  title: Text(title, maxLines: 2, overflow: TextOverflow.ellipsis),
                                  subtitle: description.isNotEmpty ? Text(description, maxLines: 2, overflow: TextOverflow.ellipsis) : null,
                                  trailing: score != null ? Chip(label: Text('Score ${(score is num ? score : 0).toStringAsFixed(1)}')) : null,
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  IconData _iconForType(String type) {
    switch (type) {
      case 'person':
      case 'people':
        return Icons.person;
      case 'document':
        return Icons.description_outlined;
      case 'meeting':
        return Icons.meeting_room_outlined;
      case 'project':
        return Icons.folder_outlined;
      case 'technology':
        return Icons.code_outlined;
      default:
        return Icons.article_outlined;
    }
  }
}

class _ModeChip extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final ValueChanged<String> onSelected;
  const _ModeChip({required this.label, required this.value, required this.selected, required this.onSelected});

  @override
  Widget build(BuildContext context) {
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onSelected(value),
    );
  }
}
