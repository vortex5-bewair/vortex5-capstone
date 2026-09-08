import 'package:flutter/material.dart';
import 'package:vortex5_application_2/app_state.dart';

import 'alert_page.dart';
import 'bulletin_board_page.dart';
import 'device_page.dart';
import 'home_page.dart';
import 'profile_page.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  int _currentIndex = 0;
  final AppState _appState = AppState();
  bool _ready = false;

  // Index 0 (Home) is the only tab that shows live sensor numbers, so the 2s
  // poll is retained only while it's selected. Tracked so we never double
  // count on rebuilds.
  bool _liveRetained = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _appState.initialize(); // starts the 10s timer itself
    if (!mounted) return;
    _syncLiveRetain();
    setState(() => _ready = true);
  }

  // Only the Home tab needs the fast poll; retain/release as it comes and goes.
  void _syncLiveRetain() {
    final wantLive = _currentIndex == 0;
    if (wantLive && !_liveRetained) {
      _appState.retainLive();
      _liveRetained = true;
    } else if (!wantLive && _liveRetained) {
      _appState.releaseLive();
      _liveRetained = false;
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Pausing all polling + rebuilds while backgrounded is the energy fix.
    _appState.setForeground(state == AppLifecycleState.resumed);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _appState.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final isAdmin = _appState.isAdmin;

    // Wi-Fi provisioning ("Connect") is an admin-only capability — staff
    // can't add/pair devices, so the tab is left off their nav entirely
    // rather than showing an access-denied page.
    final pages = [
      HomePage(appState: _appState),
      AlertPage(appState: _appState),
      if (isAdmin) DevicePage(appState: _appState),
      BulletinBoardPage(appState: _appState),
      const ProfilePage(),
    ];

    final items = [
      const BottomNavigationBarItem(
        icon: Icon(Icons.home_outlined),
        activeIcon: Icon(Icons.home),
        label: 'Home',
      ),
      const BottomNavigationBarItem(
        icon: Icon(Icons.notifications_outlined),
        activeIcon: Icon(Icons.notifications),
        label: 'Alert',
      ),
      if (isAdmin)
        const BottomNavigationBarItem(
          icon: Icon(Icons.wifi_tethering_outlined),
          activeIcon: Icon(Icons.wifi_tethering),
          label: 'Connect',
        ),
      const BottomNavigationBarItem(
        icon: Icon(Icons.receipt_long_outlined),
        activeIcon: Icon(Icons.receipt_long),
        label: 'Bulletin',
      ),
      const BottomNavigationBarItem(
        icon: Icon(Icons.person_outline),
        activeIcon: Icon(Icons.person),
        label: 'Profile',
      ),
    ];

    return Scaffold(
      body: IndexedStack(index: _currentIndex, children: pages),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        currentIndex: _currentIndex,
        selectedItemColor: const Color(0xFF1E5BFF),
        unselectedItemColor: const Color(0xFF6B7280),
        selectedFontSize: 11,
        unselectedFontSize: 11,
        // Individual alerts are marked read on tap (see AlertPage), which is
        // what actually drives unreadAlertCount — there's no bulk mark-all
        // wired to visiting this tab, intentionally, so the unread
        // highlighting inside AlertPage stays visible when you open it.
        onTap: (index) {
          setState(() => _currentIndex = index);
          _syncLiveRetain();
        },
        items: items,
      ),
    );
  }
}
