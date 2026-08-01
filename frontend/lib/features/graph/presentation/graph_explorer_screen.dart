import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';

class GraphExplorerScreen extends ConsumerStatefulWidget {
  const GraphExplorerScreen({super.key});

  @override
  ConsumerState<GraphExplorerScreen> createState() => _GraphExplorerScreenState();
}

class _GraphExplorerScreenState extends ConsumerState<GraphExplorerScreen> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _nodes = [];
  List<Map<String, dynamic>> _edges = [];
  bool _isLoading = false;
  String? _error;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _explore(String query) async {
    if (query.trim().isEmpty) return;
    setState(() { _isLoading = true; _error = null; });

    try {
      final graphService = ref.read(graphServiceProvider);
      final result = await graphService.explore(query);
      setState(() {
        _nodes = (result['nodes'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        _edges = (result['relationships'] as List?)?.cast<Map<String, dynamic>>() ?? [];
        _isLoading = false;
      });
    } catch (e) {
      setState(() { _isLoading = false; _error = e.toString(); });
    }
  }

  Color _colorForType(String? type) {
    switch (type?.toLowerCase()) {
      case 'person': return Colors.blue;
      case 'project': return Colors.green;
      case 'technology': return Colors.orange;
      case 'document': return Colors.purple;
      case 'meeting': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Knowledge Graph Explorer'),
        actions: [
          IconButton(icon: const Icon(Icons.zoom_in), onPressed: () {}),
          IconButton(icon: const Icon(Icons.zoom_out), onPressed: () {}),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search graph entities...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(icon: const Icon(Icons.clear), onPressed: () { _searchController.clear(); setState(() { _nodes = []; _edges = []; }); })
                    : null,
              ),
              onSubmitted: _explore,
              textInputAction: TextInputAction.search,
            ),
          ),
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.error_outline, size: 64, color: theme.colorScheme.error),
                          const SizedBox(height: 16),
                          Text('Error loading graph', style: theme.textTheme.titleMedium),
                          const SizedBox(height: 8),
                          Text(_error!, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
                        ],
                      ))
                    : _nodes.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.hub, size: 128, color: theme.colorScheme.primary.withValues(alpha: 0.3)),
                                const SizedBox(height: 16),
                                Text('Interactive Graph Visualization', style: theme.textTheme.titleLarge),
                                const SizedBox(height: 8),
                                Text('Search for entities to explore the knowledge graph', style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
                              ],
                            ),
                          )
                        : CustomPaint(
                            painter: _GraphPainter(nodes: _nodes, edges: _edges, theme: theme),
                            child: const SizedBox.expand(),
                          ),
          ),
          if (_nodes.isNotEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                border: Border(top: BorderSide(color: theme.dividerColor)),
              ),
              child: Row(
                children: [
                  Text('${_nodes.length} nodes, ${_edges.length} relationships', style: theme.textTheme.bodySmall),
                  const Spacer(),
                  _LegendItem(color: Colors.blue, label: 'People'),
                  const SizedBox(width: 12),
                  _LegendItem(color: Colors.green, label: 'Projects'),
                  const SizedBox(width: 12),
                  _LegendItem(color: Colors.orange, label: 'Tech'),
                  const SizedBox(width: 12),
                  _LegendItem(color: Colors.purple, label: 'Docs'),
                  const SizedBox(width: 12),
                  _LegendItem(color: Colors.red, label: 'Meetings'),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendItem({required this.color, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 4),
        Text(label, style: Theme.of(context).textTheme.bodySmall),
      ],
    );
  }
}

class _GraphPainter extends CustomPainter {
  final List<Map<String, dynamic>> nodes;
  final List<Map<String, dynamic>> edges;
  final ThemeData theme;

  _GraphPainter({required this.nodes, required this.edges, required this.theme});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.shortestSide / 3;
    final nodePositions = <String, Offset>{};

    for (var i = 0; i < nodes.length; i++) {
      final angle = (2 * 3.14159 * i) / nodes.length - 3.14159 / 2;
      final pos = center + Offset(radius * 0.8 * math.cos(angle), radius * 0.8 * math.sin(angle));
      nodePositions[nodes[i]['id']?.toString() ?? '$i'] = pos;
    }

    final edgePaint = Paint()
      ..color = theme.dividerColor
      ..strokeWidth = 1;

    for (final edge in edges) {
      final from = nodePositions[edge['source']?.toString() ?? edge['from']?.toString() ?? ''];
      final to = nodePositions[edge['target']?.toString() ?? edge['to']?.toString() ?? ''];
      if (from != null && to != null) {
        canvas.drawLine(from, to, edgePaint);
      }
    }

    for (var i = 0; i < nodes.length; i++) {
      final pos = nodePositions[nodes[i]['id']?.toString() ?? '$i']!;
      final type = nodes[i]['type']?.toString() ?? nodes[i]['entityType']?.toString() ?? '';
      final color = _colorForType(type);

      canvas.drawCircle(pos, 20, Paint()..color = color.withValues(alpha: 0.2));
      canvas.drawCircle(pos, 20, Paint()..color = color..strokeWidth = 2..style = PaintingStyle.stroke);

      final tp = TextPainter(
        text: TextSpan(text: nodes[i]['name']?.toString() ?? nodes[i]['label']?.toString() ?? '', style: TextStyle(color: theme.colorScheme.onSurface, fontSize: 10)),
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: 80);
      tp.paint(canvas, pos - Offset(tp.width / 2, -24));
    }
  }

  Color _colorForType(String type) {
    switch (type.toLowerCase()) {
      case 'person': return Colors.blue;
      case 'project': return Colors.green;
      case 'technology': return Colors.orange;
      case 'document': return Colors.purple;
      case 'meeting': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  bool shouldRepaint(covariant _GraphPainter oldDelegate) => true;
}
