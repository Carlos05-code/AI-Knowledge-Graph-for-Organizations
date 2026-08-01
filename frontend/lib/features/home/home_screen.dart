import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('AI Knowledge Graph')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Welcome', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('Your organization\'s knowledge, connected and searchable.', style: theme.textTheme.bodyLarge?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            const SizedBox(height: 32),
            _QuickActionCard(
              icon: Icons.chat,
              title: 'AI Assistant',
              subtitle: 'Ask questions and get answers from your knowledge graph',
              color: theme.colorScheme.primary,
              onTap: () => context.go('/chat'),
            ),
            const SizedBox(height: 12),
            _QuickActionCard(
              icon: Icons.search,
              title: 'Enterprise Search',
              subtitle: 'Search across documents, people, and topics',
              color: theme.colorScheme.secondary,
              onTap: () => context.go('/search'),
            ),
            const SizedBox(height: 12),
            _QuickActionCard(
              icon: Icons.hub,
              title: 'Knowledge Graph',
              subtitle: 'Explore entities and relationships in your organization',
              color: theme.colorScheme.tertiary,
              onTap: () => context.go('/graph'),
            ),
            const SizedBox(height: 12),
            _QuickActionCard(
              icon: Icons.description,
              title: 'Documents',
              subtitle: 'Browse and manage uploaded documents',
              color: Colors.purple,
              onTap: () => context.go('/documents'),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActionCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _QuickActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(backgroundColor: color.withValues(alpha: 0.15), child: Icon(icon, color: color)),
        title: Text(title),
        subtitle: Text(subtitle),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
