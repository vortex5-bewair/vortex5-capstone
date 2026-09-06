import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:vortex5_application_2/app_state.dart';
import 'package:vortex5_application_2/models/sensor_device.dart';
import 'package:vortex5_application_2/pages/device_list_page.dart';
import 'package:vortex5_application_2/pages/share_device_page.dart';
import 'package:vortex5_application_2/services/air_quality_bands.dart';
import 'package:vortex5_application_2/utils/aqi_colors.dart';
import 'package:vortex5_application_2/utils/device_dialogs.dart';
import 'package:vortex5_application_2/widgets/error_state.dart';

class HomePage extends StatefulWidget {
  final AppState appState;

  const HomePage({
    super.key,
    required this.appState,
  });

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final PageController _pageController = PageController();
  int _index = 0;
  bool _refreshing = false;

  // Forgetting Wi-Fi is fire-and-forget over MQTT — there's no signal for
  // when the device actually finishes rebooting. Rather than guess with a
  // timer, remember when the command was confirmed per device and treat any
  // reading older than that moment as stale/gone — the panel falls through
  // to its existing "No Data" state immediately and only shows numbers
  // again once a genuinely new reading proves the device is back.
  final Map<String, DateTime> _resetAtByDevice = {};

  /// 'all' = show every sensor, otherwise the room name to focus on.
  String _selectedRoom = 'all';

  @override
  void initState() {
    super.initState();
    widget.appState.addListener(_handleStateChange);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncActiveToIndex());
  }

  @override
  void dispose() {
    widget.appState.removeListener(_handleStateChange);
    _pageController.dispose();
    super.dispose();
  }

  /// Sensors after applying the room filter.
  List<SensorDevice> get _filtered {
    final all = widget.appState.sensors;
    if (_selectedRoom == 'all') return all;
    return all.where((s) => s.room.trim() == _selectedRoom).toList();
  }

  void _handleStateChange() {
    if (!mounted) return;
    // Keep the page index within bounds if the (filtered) device list changed.
    final count = _filtered.length;
    if (count > 0 && _index >= count) {
      _index = count - 1;
      if (_pageController.hasClients) {
        _pageController.jumpToPage(_index);
      }
    }
    setState(() {});
  }

  void _syncActiveToIndex() {
    final sensors = _filtered;
    if (sensors.isEmpty) return;
    final i = _index.clamp(0, sensors.length - 1);
    widget.appState.connectSensor(sensors[i].id);
  }

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    await widget.appState.refreshFromBackend();
    if (mounted) setState(() => _refreshing = false);
  }

  void _onRoomChanged(String? room) {
    if (room == null) return;
    setState(() {
      _selectedRoom = room;
      _index = 0;
    });
    if (_pageController.hasClients) _pageController.jumpToPage(0);
    _syncActiveToIndex();
  }

  void _goTo(int i) {
    final sensors = _filtered;
    if (i < 0 || i >= sensors.length) return;
    _pageController.animateToPage(
      i,
      duration: const Duration(milliseconds: 280),
      curve: Curves.easeOut,
    );
  }

  // ----- Admin actions on the current sensor -----
  SensorDevice? get _current {
    final sensors = _filtered;
    if (sensors.isEmpty) return null;
    return sensors[_index.clamp(0, sensors.length - 1)];
  }

  void _openShare(SensorDevice s) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ShareDevicePage(
          appState: widget.appState,
          deviceId: s.id,
          deviceName: s.name,
        ),
      ),
    );
  }

  void _openDeviceList() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DeviceListPage(appState: widget.appState),
      ),
    );
  }

  Future<void> _confirmReset(SensorDevice s) async {
    final confirmed = await confirmResetDevice(context, s);
    if (!confirmed || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final error = await widget.appState.resetDevice(s.id);
    if (!mounted) return;

    if (error == null) {
      // Any reading from before this moment is no longer trustworthy — the
      // panel will fall through to "No Data" immediately and only show
      // numbers again once a genuinely new reading arrives.
      setState(() => _resetAtByDevice[s.id] = DateTime.now());
    }

    messenger.showSnackBar(
      SnackBar(content: Text(error ?? 'Forgetting Wi-Fi on ${s.name}...')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sensors = _filtered;

    // Tint the background by the currently shown sensor's air quality.
    final cur = _current;
    final curReading =
        (cur != null && cur.enabled) ? widget.appState.liveReadingFor(cur.id) : null;
    final tint = curReading != null
        ? aqiColorFor(curReading.aqiInstant)
        : const Color(0xFF94A3B8);

    return Scaffold(
      backgroundColor: const Color(0xFFF4F8F5),
      appBar: _appBar(),
      body: AnimatedContainer(
        duration: const Duration(milliseconds: 400),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              tint.withValues(alpha: 0.16),
              const Color(0xFFF4F8F5),
            ],
            stops: const [0.0, 0.45],
          ),
        ),
        child: SafeArea(
          top: false,
          bottom: false,
          child: Column(
            children: [
              _roomFilter(),
              Expanded(
                child: widget.appState.sensors.isEmpty &&
                        widget.appState.refreshError != null
                    ? ErrorState(
                        title: 'Could not load devices',
                        message: widget.appState.refreshError!,
                        onRetry: () => widget.appState.refreshFromBackend(),
                      )
                    : sensors.isEmpty
                        ? _emptyState()
                        : _carousel(sensors),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ======== AppBar (matches the Connect tab style) ========
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
            'BewAir',
            style: GoogleFonts.poppins(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 22,
              letterSpacing: 1.4,
            ),
          ),
        ],
      ),
      actions: [
        // Refresh
        IconButton(
          tooltip: 'Refresh',
          onPressed: _refreshing ? null : _refresh,
          icon: _refreshing
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.refresh, color: Colors.white),
        ),
        // Overflow menu (admin device actions + list of devices)
        if (widget.appState.isAdmin)
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert, color: Colors.white),
            onSelected: (value) {
              final cur = _current;
              if (value == 'list') {
                _openDeviceList();
              } else if (value == 'share' && cur != null) {
                _openShare(cur);
              } else if (value == 'reset' && cur != null) {
                _confirmReset(cur);
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'share',
                child: ListTile(
                  leading: Icon(Icons.share),
                  title: Text('Share Device'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'reset',
                child: ListTile(
                  leading: Icon(Icons.wifi_off, color: Colors.orange),
                  title: Text('Forget Wi-Fi'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
              const PopupMenuItem(
                value: 'list',
                child: ListTile(
                  leading: Icon(Icons.list_alt),
                  title: Text('List of Devices'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
      ],
    );
  }

  // ======== Room focus dropdown ========
  Widget _roomFilter() {
    final rooms = widget.appState.rooms;
    final items = <String>['all', ...rooms];
    // Guard against a stale selection after a room disappears.
    final value = items.contains(_selectedRoom) ? _selectedRoom : 'all';

    return Center(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(999),
          elevation: 1,
          shadowColor: Colors.black.withValues(alpha: 0.08),
          child: Padding(
            padding: const EdgeInsets.only(left: 16, right: 8),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: value,
                isDense: true,
                borderRadius: BorderRadius.circular(16),
                icon: const Icon(Icons.keyboard_arrow_down,
                    size: 22, color: Color(0xFF64748B)),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF0F172A),
                ),
                items: items
                    .map((r) => DropdownMenuItem(
                          value: r,
                          child: Text(r == 'all' ? 'All Rooms' : r),
                        ))
                    .toList(),
                onChanged: _onRoomChanged,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _emptyState() {
    final filtering = _selectedRoom != 'all';
    final String message;
    if (filtering) {
      message = 'No sensors in "$_selectedRoom".';
    } else if (widget.appState.isAdmin) {
      message = 'No sensors yet.\nAdd one from the Connect tab.';
    } else {
      message = 'No sensors shared with you.\nAsk an admin to share one.';
    }
    return RefreshIndicator(
      onRefresh: _refresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: 360,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.sensors_off,
                        size: 56, color: Colors.black38),
                    const SizedBox(height: 12),
                    Text(
                      message,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.black54),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ======== Swipeable per-sensor carousel ========
  Widget _carousel(List<SensorDevice> sensors) {
    return Column(
      children: [
        Expanded(
          child: PageView.builder(
            controller: _pageController,
            itemCount: sensors.length,
            onPageChanged: (i) {
              _index = i;
              widget.appState.connectSensor(sensors[i].id);
              setState(() {});
            },
            itemBuilder: (ctx, i) {
              final sensor = sensors[i];
              final rawReading = widget.appState.liveReadingFor(sensor.id);
              final resetAt = _resetAtByDevice[sensor.id];
              // A reading from before the last "Forget Wi-Fi" isn't
              // trustworthy — treat it as if it doesn't exist.
              final effectiveReading =
                  (resetAt != null && rawReading != null && !rawReading.receivedAt.isAfter(resetAt))
                      ? null
                      : rawReading;
              return RefreshIndicator(
                onRefresh: _refresh,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                  children: [
                    _SensorPanel(
                      sensor: sensor,
                      reading: effectiveReading,
                      threshold: widget.appState.aqiThreshold,
                    ),
                  ],
                ),
              );
            },
          ),
        ),
        _navBar(sensors.length),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _navBar(int count) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          IconButton(
            onPressed: _index > 0 ? () => _goTo(_index - 1) : null,
            icon: const Icon(Icons.chevron_left),
            style: IconButton.styleFrom(
              backgroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFFF1F5F9),
            ),
          ),
          // Dot indicator
          Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(count, (i) {
              final active = i == _index;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: active ? 18 : 7,
                height: 7,
                decoration: BoxDecoration(
                  color: active
                      ? const Color(0xFF1E88FF)
                      : const Color(0xFFCBD5E1),
                  borderRadius: BorderRadius.circular(4),
                ),
              );
            }),
          ),
          IconButton(
            onPressed: _index < count - 1 ? () => _goTo(_index + 1) : null,
            icon: const Icon(Icons.chevron_right),
            style: IconButton.styleFrom(
              backgroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFFF1F5F9),
            ),
          ),
        ],
      ),
    );
  }

}

/// Self-contained detail card for a single sensor. Reads only from the passed
/// sensor + reading so neighbouring PageView pages don't show the active one.
class _SensorPanel extends StatelessWidget {
  final SensorDevice sensor;
  final LiveReading? reading;
  final double threshold;

  const _SensorPanel({
    required this.sensor,
    required this.reading,
    required this.threshold,
  });

  @override
  Widget build(BuildContext context) {
    final isOff = !sensor.enabled;
    // Require the device to actually be online too, not just have some
    // previously-fetched reading sitting around — otherwise a sensor that
    // lost power or Wi-Fi (reset or not) keeps showing its last numbers
    // as if they were still live.
    final hasReading =
        reading != null && !isOff && sensor.status != SensorStatus.offline;
    final aqi = reading?.aqiInstant ?? 0;
    final color = !hasReading ? const Color(0xFF94A3B8) : aqiColorFor(aqi);

    final components = <_Component>[
      _Component('PM2.5', 'µg/m³', reading?.pm25, 1, Icons.blur_on, 'pm25'),
      _Component('PM10', 'µg/m³', reading?.pm10, 1, Icons.grain, 'pm10'),
      _Component('CO₂', 'ppm', reading?.co2, 0, Icons.air, 'co2'),
      _Component('TVOC', 'µg/m³', reading?.tvoc, 0, Icons.bubble_chart_outlined, 'tvoc'),
      _Component('Temperature', '°C', reading?.temperature, 1, Icons.device_thermostat, 'temp'),
      _Component('Humidity', '%', reading?.humidity, 0, Icons.opacity, 'humidity'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const SizedBox(height: 6),

        // Radial AQI gauge
        SizedBox(
          width: 280,
          height: 172,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // soft halo behind the dial
              if (hasReading)
                Align(
                  alignment: const Alignment(0, 0.45),
                  child: Container(
                    width: 150,
                    height: 150,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          color.withValues(alpha: 0.20),
                          color.withValues(alpha: 0.0),
                        ],
                      ),
                    ),
                  ),
                ),
              Positioned.fill(
                child: CustomPaint(
                  painter: _GaugePainter(aqi: aqi, hasData: hasReading),
                ),
              ),
              // centered value
              Align(
                alignment: const Alignment(0, 0.55),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      isOff ? '—' : (hasReading ? '$aqi' : '--'),
                      style: TextStyle(
                        color: color,
                        fontSize: 46,
                        fontWeight: FontWeight.w800,
                        height: 1,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'AQI',
                      style: TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),

        // Category word
        Text(
          isOff
              ? 'Device Off'
              : (hasReading ? reading!.aqiLabel : 'No Data'),
          style: TextStyle(
            color: color,
            fontSize: 32,
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 14),

        // Sensor name + room (AirNow-style "location")
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Flexible(
              child: Text(
                sensor.name.isEmpty ? sensor.id : sensor.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF0F172A),
                ),
              ),
            ),
            const SizedBox(width: 8),
            _StatusBadge(status: sensor.status, enabled: sensor.enabled),
          ],
        ),
        if (hasReading) ...[
          const SizedBox(height: 6),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.access_time_rounded,
                  size: 12, color: Color(0xFF94A3B8)),
              const SizedBox(width: 4),
              Text(
                'Updated ${_timeAgo(reading!.receivedAt)}',
                style: const TextStyle(
                  color: Color(0xFF94A3B8),
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 20),

        // Recommended actions for the current AQI (EPA AirNow guidance)
        if (hasReading) ...[
          _RecommendedActionsCard(aqi: aqi, color: color),
          const SizedBox(height: 20),
        ],

        // Component list — tap a row for an insight
        Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 8),
            child: Text(
              'Air Components',
              style: TextStyle(
                color: const Color(0xFF0F172A),
                fontSize: 15,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
        _componentsCard(context, components, hasReading),
      ],
    );
  }

  Widget _componentsCard(
      BuildContext context, List<_Component> comps, bool hasReading) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          children: [
            for (var i = 0; i < comps.length; i++) ...[
              if (i > 0)
                const Divider(
                  height: 1,
                  thickness: 1,
                  indent: 16,
                  endIndent: 16,
                  color: Color(0xFFEEF2F6),
                ),
              _componentRow(context, comps[i], hasReading),
            ],
          ],
        ),
      ),
    );
  }

  Widget _componentRow(BuildContext context, _Component c, bool hasReading) {
    final hasValue = hasReading && c.value != null;
    final insight = hasValue ? _insightFor(c.key, c.value!) : null;
    final dotColor = insight?.color ?? const Color(0xFFCBD5E1);
    final valueText = hasValue ? c.value!.toStringAsFixed(c.decimals) : '--';

    return InkWell(
      onTap: hasValue ? () => _showInsight(context, c, insight!) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
            ),
            const SizedBox(width: 14),
            Icon(c.icon, size: 24, color: const Color(0xFF64748B)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    c.label,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                      fontSize: 17,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    insight?.level ?? 'No data',
                    style: TextStyle(
                      color: dotColor,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            Text.rich(
              TextSpan(
                text: valueText,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  fontSize: 20,
                  color: Color(0xFF0F172A),
                ),
                children: [
                  TextSpan(
                    text: '  ${c.unit}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w500,
                      fontSize: 12,
                      color: Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ),
            if (hasValue)
              const Padding(
                padding: EdgeInsets.only(left: 6),
                child: Icon(Icons.chevron_right, color: Color(0xFFCBD5E1)),
              ),
          ],
        ),
      ),
    );
  }

  void _showInsight(BuildContext context, _Component c, _Insight insight) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(c.icon, color: const Color(0xFF1E5BFF)),
                const SizedBox(width: 10),
                Text(
                  c.label,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  c.value!.toStringAsFixed(c.decimals),
                  style: TextStyle(
                    fontSize: 40,
                    fontWeight: FontWeight.w800,
                    color: insight.color,
                    height: 1,
                  ),
                ),
                const SizedBox(width: 4),
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Text(
                    c.unit,
                    style: const TextStyle(color: Color(0xFF94A3B8)),
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: insight.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    insight.level,
                    style: TextStyle(
                      color: insight.color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              insight.advice,
              style: const TextStyle(
                color: Color(0xFF334155),
                height: 1.5,
                fontSize: 15,
              ),
            ),
            // CO₂ and formaldehyde are simulated by the FS00905B from its VOC
            // element rather than measured. Say so wherever the value is shown,
            // so nobody treats them as instrument readings.
            if (_isDerivedComponent(c.key)) ...[
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Icon(Icons.info_outline, size: 16, color: Color(0xFF94A3B8)),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Derived value — the sensor estimates this from its VOC '
                      'element rather than measuring it directly. Use it as a '
                      'trend, not an exact figure.',
                      style: TextStyle(
                        color: Color(0xFF64748B),
                        fontSize: 12.5,
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// One air-quality component shown as a row + insight sheet.
class _Component {
  final String label;
  final String unit;
  final double? value;
  final int decimals;
  final IconData icon;
  final String key;

  const _Component(this.label, this.unit, this.value, this.decimals, this.icon, this.key);
}

class _Insight {
  final String level;
  final Color color;
  final String advice;
  const _Insight(this.level, this.color, this.advice);
}

// Recommended actions for the current AQI category, taken from the canonical
// band table the backend serves. The EPA copy that used to be inlined here
// disagreed with the web dashboard about both the category names and the advice.
List<String> _aqiActions(int aqi) {
  final actions = AirQualityBands.current?.categoryFor(aqi)?.actions;
  if (actions != null && actions.isNotEmpty) return actions;
  return const [
    'Air-quality guidance is still loading. Pull down to refresh.',
  ];
}

// Sensor field name for each component key the UI uses. The field names are
// fixed by the MQTT contract shared with the firmware and the backend.
const Map<String, String> _insightFields = {
  'pm1': 'PM1',
  'pm25': 'PM25',
  'pm10': 'PM10',
  'co2': 'CO2',
  'tvoc': 'TVOC',
  'hcho': 'Formaldehyde',
  'temp': 'Temperature',
  'humidity': 'Humidity',
};

/// Qualitative reading + advice for a component value, graded against the
/// canonical band table. This used to inline US EPA PM cut-points, a 20-26 °C
/// comfort range and a 30-60 % humidity range — temperate-climate numbers that
/// marked a normal Manila classroom permanently out of range.
_Insight _insightFor(String key, double v) {
  final field = _insightFields[key];
  final band = field == null ? null : AirQualityBands.current?.bandFor(field, v);
  if (band == null) {
    return const _Insight('—', Color(0xFF94A3B8), 'No insight available.');
  }
  return _Insight(band.level, band.color, band.advice);
}

/// True when this component is simulated by the sensor rather than measured
/// (CO2 and formaldehyde are derived from the VOC element). The detail sheet
/// says so rather than presenting them as instrument readings.
bool _isDerivedComponent(String key) {
  final field = _insightFields[key];
  if (field == null) return false;
  return AirQualityBands.current?.fields[field]?.derived ?? false;
}

class _RecommendedActionsCard extends StatefulWidget {
  final int aqi;
  final Color color;

  const _RecommendedActionsCard({required this.aqi, required this.color});

  @override
  State<_RecommendedActionsCard> createState() =>
      _RecommendedActionsCardState();
}

class _RecommendedActionsCardState extends State<_RecommendedActionsCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final actions = _aqiActions(widget.aqi);
    final color = widget.color;

    return AnimatedSize(
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeInOut,
      alignment: Alignment.topCenter,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row
            Row(
              children: [
                Icon(Icons.shield_outlined, size: 20, color: color),
                const SizedBox(width: 8),
                const Text(
                  'Recommended Actions',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: Color(0xFF0F172A),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Collapsed: first action as a single preview line
            if (!_expanded) ...[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(top: 6, right: 8),
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration:
                          BoxDecoration(color: color, shape: BoxShape.circle),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      actions.first,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF334155),
                        fontSize: 13.5,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              GestureDetector(
                onTap: () => setState(() => _expanded = true),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'See all actions',
                      style: TextStyle(
                        color: color,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 2),
                    Icon(Icons.keyboard_arrow_down, size: 16, color: color),
                  ],
                ),
              ),
            ],

            // Expanded: all actions + source + collapse link
            if (_expanded) ...[
              ...actions.map(
                (a) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(top: 6, right: 8),
                        child: Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                              color: color, shape: BoxShape.circle),
                        ),
                      ),
                      Expanded(
                        child: Text(
                          a,
                          style: const TextStyle(
                            color: Color(0xFF334155),
                            fontSize: 13.5,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Text(
                'Source: U.S. EPA AirNow',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
              ),
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => setState(() => _expanded = false),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      'Show less',
                      style: TextStyle(
                        color: color,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 2),
                    Icon(Icons.keyboard_arrow_up, size: 16, color: color),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  final SensorStatus status;
  final bool enabled;

  const _StatusBadge({required this.status, required this.enabled});

  @override
  Widget build(BuildContext context) {
    final Color dotColor;
    final String label;

    if (!enabled) {
      dotColor = const Color(0xFF94A3B8);
      label = 'Off';
    } else if (status == SensorStatus.offline) {
      dotColor = const Color(0xFFEF4444);
      label = 'Offline';
    } else {
      dotColor = const Color(0xFF22C55E);
      label = 'Online';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: dotColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: dotColor,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

String _timeAgo(DateTime dt) {
  final diff = DateTime.now().difference(dt);
  if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  return '${diff.inDays}d ago';
}

/// Semicircular AQI gauge: equal-width category segments, a filled fan up to
/// the current value, and a white triangular needle (AirNow style).
class _GaugePainter extends CustomPainter {
  final int aqi;
  final bool hasData;

  _GaugePainter({required this.aqi, required this.hasData});

  // Equal-width category segments (each gets the same slice of the arc).
  static const _bounds = <double>[0, 50, 100, 150, 200, 300, 500];

  // Resolved per repaint rather than held as a const, so the gauge picks up the
  // served band colours once the canonical table loads instead of being frozen
  // to the bundled palette at class-load time.
  List<Color> get _bandColors => aqiBandColorsNow();

  int get _segCount => _bandColors.length;

  double _angleFor(double v) {
    final span = math.pi / _segCount;
    for (var i = 0; i < _segCount; i++) {
      if (v <= _bounds[i + 1] || i == _segCount - 1) {
        final lo = _bounds[i], hi = _bounds[i + 1];
        final frac = ((v - lo) / (hi - lo)).clamp(0.0, 1.0);
        return math.pi + (i + frac) * span;
      }
    }
    return math.pi;
  }

  Color _colorFor(double v) {
    for (var i = 0; i < _segCount; i++) {
      if (v <= _bounds[i + 1]) return _bandColors[i];
    }
    return _bandColors.last;
  }

  @override
  void paint(Canvas canvas, Size size) {
    const stroke = 15.0;
    final center = Offset(size.width / 2, size.height - 6);
    final radius = (size.width - stroke) / 2 - 2;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final span = math.pi / _segCount;
    const gap = 0.020; // small gap between segments

    // Colored category segments
    for (var i = 0; i < _segCount; i++) {
      final start = math.pi + i * span + gap / 2;
      final sweep = span - gap;
      final paint = Paint()
        ..color = hasData
            ? _bandColors[i]
            : _bandColors[i].withValues(alpha: 0.20)
        ..style = PaintingStyle.stroke
        ..strokeWidth = stroke
        ..strokeCap = StrokeCap.round;
      canvas.drawArc(rect, start, sweep, false, paint);
    }

    if (!hasData) return;

    // Marker knob sitting on the arc at the current value — keeps the dial
    // centre clear for the big number (no needle/fan overlap).
    final v = aqi.toDouble();
    final markerAngle = _angleFor(v);
    final cat = _colorFor(v);
    final dir = Offset(math.cos(markerAngle), math.sin(markerAngle));
    final markerCenter = center + dir * radius;

    // outer glow ring
    canvas.drawCircle(
      markerCenter,
      14,
      Paint()..color = cat.withValues(alpha: 0.18),
    );
    // white knob with colored border
    canvas.drawCircle(markerCenter, 10, Paint()..color = Colors.white);
    canvas.drawCircle(
      markerCenter,
      10,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5
        ..color = cat,
    );
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) =>
      old.aqi != aqi || old.hasData != hasData;
}
