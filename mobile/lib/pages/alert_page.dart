import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vortex5_application_2/app_state.dart';
import 'package:vortex5_application_2/models/alert_item.dart';
import 'package:vortex5_application_2/widgets/error_state.dart';

class AlertPage extends StatefulWidget {
  const AlertPage({super.key, required this.appState});

  final AppState appState;

  @override
  State<AlertPage> createState() => _AlertPageState();
}

class _AlertPageState extends State<AlertPage> {
  static const _metricFields = ['All', 'Aqi', 'PM25', 'PM10', 'CO2', 'TVOC', 'Formaldehyde'];

  int _filter = 0;
  String _metricFilter = 'All';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadHistory());
  }

  Future<void> _loadHistory() async {
    setState(() { _loading = true; _error = null; });
    final error = await widget.appState.fetchAlertHistory();
    if (mounted) setState(() { _loading = false; _error = error; });
  }

  Future<void> _refresh() async {
    final error = await widget.appState.fetchAlertHistory();
    if (mounted) setState(() => _error = error);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4F8F5),
      appBar: _appBar(),
      body: AnimatedBuilder(
        animation: widget.appState,
        builder: (context, _) {
          final alerts = _visibleAlerts();
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${widget.appState.unreadAlertCount} unread notifications',
                  style: const TextStyle(color: Color(0xFF64748B)),
                ),
                const SizedBox(height: 12),
                _filterBar(),
                const SizedBox(height: 10),
                Align(
                  alignment: Alignment.centerLeft,
                  child: _metricDropdown(),
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: _loading
                      ? const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircularProgressIndicator(),
                              SizedBox(height: 16),
                              Text(
                                'Loading alerts…\nServer may take a moment to wake up.',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: Color(0xFF5B6674),
                                  fontSize: 13,
                                ),
                              ),
                            ],
                          ),
                        )
                      : _error != null
                          ? ErrorState(
                              title: 'Could not load alerts',
                              message: _error!,
                              onRetry: _loadHistory,
                            )
                          : RefreshIndicator(
                              onRefresh: _refresh,
                              child: alerts.isEmpty
                                  ? ListView(
                                      physics:
                                          const AlwaysScrollableScrollPhysics(),
                                      children: [
                                        SizedBox(
                                            height: 320,
                                            child: _emptyState()),
                                      ],
                                    )
                                  : ListView.builder(
                                      physics:
                                          const AlwaysScrollableScrollPhysics(),
                                      itemCount: alerts.length,
                                      itemBuilder: (context, index) =>
                                          _alertCard(alerts[index]),
                                    ),
                            ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  // ── AppBar matching the home page style ──────────────────────────────────
  PreferredSizeWidget _appBar() {
    const blue = Color(0xFF1E5BFF);
    return AppBar(
      backgroundColor: blue,
      elevation: 0,
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Image.asset(
            'assets/images/bewair_logo_white.png',
            height: 28,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Text(
            'Notifications',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 22,
              letterSpacing: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  // ── Filter tabs ──────────────────────────────────────────────────────────
  Widget _filterBar() {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFFE5E7EB),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          _tab('All', 0),
          _tab('Unread', 1),
        ],
      ),
    );
  }

  Widget _tab(String label, int value) {
    final selected = _filter == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _filter = value),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          margin: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: selected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: selected
                    ? const Color(0xFF0F172A)
                    : const Color(0xFF64748B),
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── Metric filter dropdown ───────────────────────────────────────────────
  Widget _metricDropdown() {
    return Container(
      height: 48,
      width: 150,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFD1D5DB)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _metricFilter,
          isExpanded: true,
          // No isDense: keeps the button at the 48dp minimum tap target.
          icon: const Icon(Icons.keyboard_arrow_down_rounded,
              size: 18, color: Color(0xFF64748B)),
          borderRadius: BorderRadius.circular(14),
          onChanged: (value) {
            if (value != null) setState(() => _metricFilter = value);
          },
          items: _metricFields.map((f) {
            final label = f == 'All' ? 'All metrics' : AlertItem.fieldLabel(f);
            return DropdownMenuItem(
              value: f,
              child: Text(
                label,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600, color: Color(0xFF0F172A)),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  Widget _emptyState() {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.notifications_none_rounded,
              size: 56, color: Colors.black26),
          SizedBox(height: 12),
          Text(
            'No notifications yet.',
            style: TextStyle(color: Colors.black45),
          ),
        ],
      ),
    );
  }

  // ── Alert card (tappable) ────────────────────────────────────────────────
  Widget _alertCard(AlertItem alert) {
    final accent = _accentFor(alert);
    return GestureDetector(
      onTap: () {
        widget.appState.markAlertHistoryRead(alert.key);
        _showDetail(alert);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: alert.isRead ? Colors.white : const Color(0xFFEFF6FF),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: alert.isRead
                ? const Color(0xFFE2E8F0)
                : accent.withValues(alpha: 0.40),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(_iconFor(alert), size: 18, color: accent),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          alert.title,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF0F172A),
                          ),
                        ),
                      ),
                      if (!alert.isRead)
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: accent,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    alert.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFF475569),
                      fontSize: 13,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _timeAgo(alert.createdAt),
                    style: const TextStyle(
                      color: Color(0xFF5B6674),
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right,
                size: 18, color: Color(0xFFCBD5E1)),
          ],
        ),
      ),
    );
  }

  // ── Detail bottom sheet ──────────────────────────────────────────────────
  void _showDetail(AlertItem alert) {
    final accent = _accentFor(alert);
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Type badge
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(_iconFor(alert), size: 14, color: accent),
                  const SizedBox(width: 6),
                  Text(
                    _typeLabel(alert.type),
                    style: TextStyle(
                      color: accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            // Title
            Text(
              alert.title,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Color(0xFF0F172A),
              ),
            ),
            const SizedBox(height: 12),
            // Full message
            Text(
              alert.message,
              style: const TextStyle(
                color: Color(0xFF334155),
                fontSize: 15,
                height: 1.6,
              ),
            ),
            const SizedBox(height: 20),
            // Divider + metadata
            const Divider(color: Color(0xFFE2E8F0)),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.access_time_rounded,
                    size: 14, color: Color(0xFF94A3B8)),
                const SizedBox(width: 6),
                Text(
                  _formattedDate(alert.createdAt),
                  style: const TextStyle(
                    color: Color(0xFF5B6674),
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  List<AlertItem> _visibleAlerts() {
    var result = widget.appState.alertHistory;
    if (_filter == 1) result = result.where((a) => !a.isRead).toList();
    if (_metricFilter != 'All') {
      result = result.where((a) => a.field == _metricFilter).toList();
    }
    return result;
  }

  Color _accentFor(AlertItem alert) {
    switch (alert.type) {
      case AlertType.aqi:
        return const Color(0xFFEF4444);
      case AlertType.advisory:
        return const Color(0xFFF59E0B);
      case AlertType.reminder:
        return const Color(0xFF1E5BFF);
    }
  }

  IconData _iconFor(AlertItem alert) {
    switch (alert.type) {
      case AlertType.aqi:
        return Icons.air;
      case AlertType.advisory:
        return Icons.info_outline_rounded;
      case AlertType.reminder:
        return Icons.notifications_none_rounded;
    }
  }

  String _typeLabel(AlertType type) {
    switch (type) {
      case AlertType.aqi:
        return 'AQI Alert';
      case AlertType.advisory:
        return 'Advisory';
      case AlertType.reminder:
        return 'Reminder';
    }
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  String _formattedDate(DateTime dt) {
    final months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final period = dt.hour < 12 ? 'AM' : 'PM';
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}  $h:$m $period';
  }
}
