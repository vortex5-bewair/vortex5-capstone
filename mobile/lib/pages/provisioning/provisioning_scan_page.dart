import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:wifi_iot/wifi_iot.dart';
import 'package:permission_handler/permission_handler.dart';

import 'provisioning_credentials_page.dart';
import 'provisioning_instructions_page.dart';

const String _esp32GatewayUrl = 'http://192.168.4.1';

/// Scans for nearby "BewAir-*" SoftAP hotspots and lets the user pick one.
/// On selection, the app joins that hotspot programmatically (no need to open
/// phone settings) and continues to the credentials step.
class ProvisioningScanPage extends StatefulWidget {
  const ProvisioningScanPage({super.key});

  @override
  State<ProvisioningScanPage> createState() => _ProvisioningScanPageState();
}

class _ProvisioningScanPageState extends State<ProvisioningScanPage> {
  List<WifiNetwork> _found = [];
  bool _scanning = false;
  bool _connecting = false;
  String? _connectingSsid;
  String? _error;
  bool _permissionDenied = false;
  // The WiFi the phone is on before joining the sensor's AP — used to pre-fill
  // the SSID on the credentials page (the sensor usually joins the same network).
  String? _homeSsid;

  @override
  void initState() {
    super.initState();
    _scan();
  }

  Future<bool> _ensurePermissions() async {
    // Location is required for Wi-Fi scanning on Android < 13.
    // NEARBY_WIFI_DEVICES covers Android 13+. Request both; either satisfying works.
    final statuses = await [
      Permission.location,
      Permission.nearbyWifiDevices,
    ].request();

    final ok = statuses[Permission.location]?.isGranted == true ||
        statuses[Permission.nearbyWifiDevices]?.isGranted == true;
    if (!ok && mounted) setState(() => _permissionDenied = true);
    return ok;
  }

  Future<void> _scan() async {
    if (_scanning) return;
    setState(() {
      _scanning = true;
      _error = null;
    });

    try {
      final granted = await _ensurePermissions();
      if (!granted) {
        setState(() => _scanning = false);
        return;
      }

      // Capture the network the phone is currently on (home/school WiFi) so we
      // can pre-fill it later. Do this before joining any BewAir AP.
      if (_homeSsid == null) {
        try {
          final ssid = (await WiFiForIoTPlugin.getSSID())?.replaceAll('"', '');
          if (ssid != null &&
              ssid.isNotEmpty &&
              !ssid.toLowerCase().contains('unknown') &&
              !ssid.toUpperCase().startsWith('BEWAIR-')) {
            _homeSsid = ssid;
          }
        } catch (_) {/* ignore */}
      }

      final list = await WiFiForIoTPlugin.loadWifiList();
      final bewair = list
          .where((n) => (n.ssid ?? '').toUpperCase().startsWith('BEWAIR-'))
          .toList()
        ..sort((a, b) => (b.level ?? -999).compareTo(a.level ?? -999));

      if (!mounted) return;
      setState(() {
        _found = bewair;
        _scanning = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Scan failed: $e';
        _scanning = false;
      });
    }
  }

  Future<void> _connectTo(String ssid) async {
    setState(() {
      _connecting = true;
      _connectingSsid = ssid;
      _error = null;
    });

    try {
      // The BewAir AP is an OPEN network (no password).
      final connected = await WiFiForIoTPlugin.connect(
        ssid,
        joinOnce: true,
        security: NetworkSecurity.NONE,
        withInternet: false,
      ).timeout(const Duration(seconds: 25));

      if (!connected) {
        throw Exception('Could not join $ssid');
      }

      // Route this app's traffic through the AP (which has no internet) so we
      // can reach the ESP32 at 192.168.4.1.
      await WiFiForIoTPlugin.forceWifiUsage(true);

      // Confirm the ESP32 is reachable and grab its deviceId.
      final deviceId = await _fetchDeviceId();
      if (deviceId == null) {
        throw Exception('Joined $ssid but the sensor did not respond.');
      }

      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => ProvisioningCredentialsPage(
            deviceId: deviceId,
            prefillSsid: _homeSsid,
          ),
        ),
      );
    } catch (e) {
      // Release the binding so the phone returns to normal networking.
      await WiFiForIoTPlugin.forceWifiUsage(false);
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _connecting = false;
        _connectingSsid = null;
      });
    }
  }

  // Poll /info a few times — the AP can take a moment to become reachable.
  Future<String?> _fetchDeviceId() async {
    for (var i = 0; i < 6; i++) {
      try {
        final res = await http
            .get(Uri.parse('$_esp32GatewayUrl/info'))
            .timeout(const Duration(seconds: 3));
        if (res.statusCode == 200) {
          final body = jsonDecode(res.body) as Map<String, dynamic>;
          final id = body['deviceId']?.toString() ?? '';
          if (id.isNotEmpty) return id;
        }
      } catch (_) {/* retry */}
      await Future.delayed(const Duration(seconds: 1));
    }
    return null;
  }

  void _openManualFlow() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const ProvisioningInstructionsPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E5BFF),
        foregroundColor: Colors.white,
        title: const Text('Add Device'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Find your sensor',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'Power on your BewAir sensor, then pick it from the list below. ',
              style: TextStyle(color: Colors.black54, height: 1.4),
            ),
            const SizedBox(height: 20),

            if (_permissionDenied)
              const _InfoBox(
                color: Color(0xFFFFF7ED),
                border: Color(0xFFFDBA74),
                child: Text(
                  'Location / nearby-devices permission is needed to scan for sensors. '
                  'Please enable it in app settings, then tap Rescan.',
                  style: TextStyle(color: Color(0xFF92400E)),
                ),
              ),

            if (_error != null)
              _InfoBox(
                color: const Color(0xFFFEF2F2),
                border: const Color(0xFFFECACA),
                child: Text(_error!, style: const TextStyle(color: Color(0xFF991B1B))),
              ),

            Expanded(
              child: _scanning && _found.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(),
                          SizedBox(height: 12),
                          Text('Scanning for sensors...',
                              style: TextStyle(color: Colors.black54)),
                        ],
                      ),
                    )
                  : _found.isEmpty
                      ? const Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.wifi_find,
                                  size: 56, color: Color(0xFFCBD5E1)),
                              SizedBox(height: 12),
                              Text('No sensors found',
                                  style: TextStyle(
                                      fontSize: 16, fontWeight: FontWeight.w700)),
                              SizedBox(height: 6),
                              Text(
                                'Make sure the sensor is powered on and in setup mode.',
                                textAlign: TextAlign.center,
                                style: TextStyle(color: Colors.black54),
                              ),
                            ],
                          ),
                        )
                      : ListView.separated(
                          itemCount: _found.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (ctx, i) {
                            final n = _found[i];
                            final ssid = n.ssid ?? '';
                            final isConnectingThis =
                                _connecting && _connectingSsid == ssid;
                            return _SensorTile(
                              ssid: ssid,
                              level: n.level,
                              busy: isConnectingThis,
                              disabled: _connecting && !isConnectingThis,
                              onTap: () => _connectTo(ssid),
                            );
                          },
                        ),
            ),

            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _scanning || _connecting ? null : _scan,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Rescan'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextButton(
                    onPressed: _connecting ? null : _openManualFlow,
                    child: const Text('Connect manually'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SensorTile extends StatelessWidget {
  final String ssid;
  final int? level;
  final bool busy;
  final bool disabled;
  final VoidCallback onTap;

  const _SensorTile({
    required this.ssid,
    required this.level,
    required this.busy,
    required this.disabled,
    required this.onTap,
  });

  IconData get _signalIcon {
    final l = level ?? -100;
    if (l >= -55) return Icons.wifi;
    if (l >= -70) return Icons.wifi_2_bar;
    return Icons.wifi_1_bar;
  }

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: disabled ? 0.5 : 1,
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          onTap: disabled ? null : onTap,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: const Color(0xFF1E5BFF).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(Icons.sensors, color: Color(0xFF1E5BFF)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ssid,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text('Tap to connect',
                          style: TextStyle(
                              fontSize: 12, color: Colors.grey.shade600)),
                    ],
                  ),
                ),
                if (busy)
                  const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(_signalIcon, color: const Color(0xFF64748B)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _InfoBox extends StatelessWidget {
  final Color color;
  final Color border;
  final Widget child;
  const _InfoBox({required this.color, required this.border, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: border),
      ),
      child: child,
    );
  }
}
