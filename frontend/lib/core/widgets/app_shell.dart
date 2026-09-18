import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../features/notifications/presentation/notifications_provider.dart';

/// Below this width a NavigationRail with always-on labels leaves almost no
/// room for content — switches to a bottom NavigationBar instead. 600 is
/// Material's own compact/medium breakpoint.
const double _railBreakpoint = 600;

class _NavItem {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final String route;
  const _NavItem(this.icon, this.selectedIcon, this.label, this.route);
}

const _navItems = [
  _NavItem(Icons.home_outlined, Icons.home, 'Home', '/'),
  _NavItem(Icons.chat_outlined, Icons.chat, 'Chat', '/chat'),
  _NavItem(Icons.search_outlined, Icons.search, 'Search', '/search'),
  _NavItem(Icons.description_outlined, Icons.description, 'Docs', '/documents'),
  _NavItem(Icons.hub_outlined, Icons.hub, 'Graph', '/graph'),
  _NavItem(Icons.link_outlined, Icons.link, 'Connectors', '/connectors'),
  _NavItem(Icons.meeting_room_outlined, Icons.meeting_room, 'Meetings', '/meetings'),
  _NavItem(Icons.notifications_outlined, Icons.notifications, 'Alerts', '/notifications'),
];

class AppShell extends ConsumerStatefulWidget {
  final Widget child;
  const AppShell({super.key, required this.child});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(notificationsProvider.notifier).refreshUnread(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(notificationsProvider).unreadCount;
    final selectedIndex = _currentIndex(context);
    final isCompact = MediaQuery.sizeOf(context).width < _railBreakpoint;

    Widget iconFor(int i, {required bool selected}) {
      final item = _navItems[i];
      final icon = Icon(selected ? item.selectedIcon : item.icon);
      if (item.label != 'Alerts') return icon;
      return Badge(
        isLabelVisible: unread > 0,
        label: Text(unread > 99 ? '99+' : '$unread'),
        child: icon,
      );
    }

    if (isCompact) {
      return Scaffold(
        body: widget.child,
        bottomNavigationBar: NavigationBar(
          selectedIndex: selectedIndex,
          onDestinationSelected: (i) => _navigate(context, i),
          labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
          destinations: [
            for (var i = 0; i < _navItems.length; i++)
              NavigationDestination(
                icon: iconFor(i, selected: false),
                selectedIcon: iconFor(i, selected: true),
                label: _navItems[i].label,
              ),
          ],
        ),
      );
    }

    return Scaffold(
      body: Row(
        children: [
          NavigationRail(
            selectedIndex: selectedIndex,
            onDestinationSelected: (i) => _navigate(context, i),
            labelType: NavigationRailLabelType.all,
            destinations: [
              for (var i = 0; i < _navItems.length; i++)
                NavigationRailDestination(
                  icon: iconFor(i, selected: false),
                  selectedIcon: iconFor(i, selected: true),
                  label: Text(_navItems[i].label),
                ),
            ],
          ),
          const VerticalDivider(width: 1),
          Expanded(child: widget.child),
        ],
      ),
    );
  }

  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    for (var i = _navItems.length - 1; i >= 0; i--) {
      if (i > 0 && location.startsWith(_navItems[i].route)) return i;
    }
    return 0;
  }

  void _navigate(BuildContext context, int index) {
    context.go(_navItems[index].route);
  }
}
