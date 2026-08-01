import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class AppShell extends StatelessWidget {
  final Widget child;
  const AppShell({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: _currentIndex(context),
            onDestinationSelected: (i) => _navigate(context, i),
            labelType: NavigationRailLabelType.all,
            destinations: const [
              NavigationRailDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: Text('Home')),
              NavigationRailDestination(icon: Icon(Icons.chat_outlined), selectedIcon: Icon(Icons.chat), label: Text('Chat')),
              NavigationRailDestination(icon: Icon(Icons.search_outlined), selectedIcon: Icon(Icons.search), label: Text('Search')),
              NavigationRailDestination(icon: Icon(Icons.description_outlined), selectedIcon: Icon(Icons.description), label: Text('Docs')),
              NavigationRailDestination(icon: Icon(Icons.hub_outlined), selectedIcon: Icon(Icons.hub), label: Text('Graph')),
              NavigationRailDestination(icon: Icon(Icons.link_outlined), selectedIcon: Icon(Icons.link), label: Text('Connectors')),
              NavigationRailDestination(icon: Icon(Icons.meeting_room_outlined), selectedIcon: Icon(Icons.meeting_room), label: Text('Meetings')),
            ],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: child),
        ],
      ),
    );
  }

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    if (location.startsWith('/chat')) return 1;
    if (location.startsWith('/search')) return 2;
    if (location.startsWith('/documents')) return 3;
    if (location.startsWith('/graph')) return 4;
    if (location.startsWith('/connectors')) return 5;
    if (location.startsWith('/meetings')) return 6;
    return 0;
  }

  void _navigate(BuildContext context, int index) {
    final routes = ['/', '/chat', '/search', '/documents', '/graph', '/connectors', '/meetings'];
    context.go(routes[index]);
  }
}
