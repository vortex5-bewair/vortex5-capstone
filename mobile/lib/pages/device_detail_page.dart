import 'package:flutter/material.dart';
import 'package:vortex5_application_2/app_state.dart';
import 'package:vortex5_application_2/models/sensor_device.dart';
import 'package:vortex5_application_2/pages/share_device_page.dart';

/// Detailed AQI + metrics view for a single sensor.
/// Pushed from the home page grid when a device card is tapped.
class DeviceDetailPage extends StatefulWidget {
  final AppState appState;
  final String sensorId;

  const DeviceDetailPage({
    super.key,
    required this.appState,
    required this.sensorId,
  });

  @override
  State<DeviceDetailPage> createState() => _DeviceDetailPageState();
}

class _DeviceDetailPageState extends State<DeviceDetailPage> {
  @override
  void initState() {
    super.initState();
    widget.appState.addListener(_onChange);
    // Mark this sensor as the active one so AppState's metric getters apply to it.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.appState.connectSensor(widget.sensorId);
    });
  }

  @override
  void dispose() {
    widget.appState.removeListener(_onChange);
    super.dispose();
  }

  void _onChange() {
    if (mounted) setState(() {});
  }

  void _openShare(SensorDevice sensor) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ShareDevicePage(
          appState: widget.appState,
          deviceId: sensor.id,
          deviceName: sensor.name,
        ),
      ),
    );
  }

  Future<void> _confirmReset(SensorDevice sensor) async {
    if (sensor.status == SensorStatus.offline) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Device must be online to receive a reset command. '
            'Use the BOOT button on the ESP32 instead.',
          ),
        ),
      );
      return;
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Device?'),
        content: Text(
          'This will wipe the Wi-Fi credentials on ${sensor.name} and put it '
          'back into provisioning mode (Wi-Fi "BewAir-XXXX" will appear). '
          'The device record stays in the system, but it will need to be '
          're-provisioned to come back online.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reset', style: TextStyle(color: Colors.orange)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    final error = await widget.appState.resetDevice(sensor.id);
    if (!mounted) return;
    messenger.showSnackBar(
      SnackBar(
        content: Text(error ?? 'Reset command sent to ${sensor.name}.'),
      ),
    );
  }

  SensorDevice get _sensor => widget.appState.sensors.firstWhere(
        (s) => s.id == widget.sensorId,
        orElse: () => SensorDevice(
          id: widget.sensorId,
          name: 'Unknown',
          room: '',
          status: SensorStatus.offline,
          lastUpdated: DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
          details: '',
          esp32IpAddress: '',
          esp32Endpoint: '',
          wifiName: '',
          connectionType: 'MQTT',
        ),
      );

  @override
  Widget build(BuildContext context) {
    final sensor = _sensor;
    final reading = widget.appState.liveReadingFor(sensor.id);
    final hasReading = reading != null;

    final statusColor = !hasReading
        ? const Color(0xFF94A3B8)
        : (widget.appState.aqiLabel == 'Good'
            ? const Color(0xFF0A9A40)
            : const Color(0xFFF97316));
    final trendIcon = widget.appState.aqi <= widget.appState.aqiThreshold
        ? Icons.trending_up
        : Icons.trending_down;
    final trendText = widget.appState.aqi <= widget.appState.aqiThreshold
        ? 'Within threshold'
        : 'Above threshold';

    return Scaffold(
      backgroundColor: const Color(0xFFF4F8F5),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E88FF),
        foregroundColor: Colors.white,
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              sensor.name,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
            ),
            Text(
              sensor.room,
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ),
        actions: [
          if (widget.appState.isAdmin)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert, color: Colors.white),
              onSelected: (value) {
                if (value == 'share') _openShare(sensor);
                if (value == 'reset') _confirmReset(sensor);
              },
              itemBuilder: (_) => const [
                PopupMenuItem(
                  value: 'share',
                  child: ListTile(
                    leading: Icon(Icons.share),
                    title: Text('Share Device'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
                PopupMenuItem(
                  value: 'reset',
                  child: ListTile(
                    leading: Icon(Icons.restart_alt, color: Colors.orange),
                    title: Text('Reset Device'),
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ],
            ),
        ],
      ),
      body: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFDDF5E4),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: const Color(0xFFC4E8CE)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          sensor.room.isEmpty ? sensor.name : sensor.room,
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.8),
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Text(
                            hasReading ? widget.appState.aqiLabel : '--',
                            style: TextStyle(
                              color: statusColor,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      hasReading
                          ? 'Updated ${_timeAgo(widget.appState.lastUpdated)}'
                          : 'No data yet',
                      style: const TextStyle(color: Colors.black54),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 20),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(22),
                      ),
                      child: Column(
                        children: [
                          const Text(
                            'Air Quality Index',
                            style: TextStyle(color: Colors.black54, fontSize: 22),
                          ),
                          Text(
                            hasReading ? '${widget.appState.aqi}' : '--',
                            style: TextStyle(
                              color: statusColor,
                              fontSize: 68,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          Text(
                            hasReading ? widget.appState.aqiLabel : '--',
                            style: TextStyle(
                              color: statusColor,
                              fontSize: 30,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 8),
                          if (hasReading)
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(trendIcon, color: statusColor),
                                const SizedBox(width: 6),
                                Text(
                                  trendText,
                                  style: TextStyle(
                                    color: statusColor,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _metric(
                          icon: Icons.air,
                          label: 'CO2',
                          value: widget.appState.co2,
                        ),
                        const SizedBox(width: 8),
                        _metric(
                          icon: Icons.water_drop_outlined,
                          label: 'PM2.5',
                          value: widget.appState.pm25,
                        ),
                        const SizedBox(width: 8),
                        _metric(
                          icon: Icons.device_thermostat,
                          label: 'Temp',
                          value: widget.appState.temp,
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Text(
                          'PM10\n${widget.appState.pm10}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        const Spacer(),
                        Text(
                          'Humidity\n${widget.appState.humidity}',
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _metric({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            Icon(icon, color: const Color(0xFF1E88FF)),
            const SizedBox(height: 6),
            Text(label, style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 4),
            Text(
              value,
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }

  String _timeAgo(DateTime dateTime) {
    final diff = DateTime.now().difference(dateTime);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes} min ago';
    if (diff.inDays < 1) return '${diff.inHours} hr ago';
    return '${diff.inDays} day ago';
  }
}
