import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:vortex5_application_2/models/alert_item.dart';
import 'package:vortex5_application_2/models/sensor_device.dart';
import 'package:vortex5_application_2/models/user_session.dart';
import 'package:vortex5_application_2/services/air_quality_bands.dart';
import 'package:vortex5_application_2/services/local_storage_service.dart';
import 'package:vortex5_application_2/services/notification_service.dart';

class AppState extends ChangeNotifier {
  AppState();

  static const _settingsKey = 'app_alert_settings';

  // Reading per deviceId — populated from /api/aqi/latest. This is the
  // 12-hour reported figure; alerting keys off it exclusively (see
  // _rebuildAlerts), same principle as the web dashboard: alerts never fire
  // off a single live sample.
  final Map<String, SensorReadings> _readingsBySensorId = {};

  // Per-frame live reading per deviceId — populated from /api/aqi/live on
  // its own ~2s timer, independent of the 10s stored-data refresh above.
  // Only devices currently reporting a fresh (non-stale) frame get an entry,
  // matching _readingsBySensorId's "absent means no data" convention.
  final Map<String, LiveReading> _liveBySensorId = {};

  // Sensors fetched from /api/device.
  List<SensorDevice> _sensors = [];

  final List<AlertItem> _alerts = [];

  List<AlertItem> _alertHistory = [];
  final Set<String> _readHistoryKeys = {};

  String? _refreshError;
  String _activeSensorId = '';
  // Tracks the STORED (12-hour reported) reading only — used to decide when
  // to push an "Air quality updated" notification. Deliberately not exposed;
  // the public aqi/aqiLabel getters below read the live reading instead.
  int _reportedAqi = 0;
  String _reportedAqiLabel = '--';
  DateTime _lastUpdated = DateTime.now();
  bool _hasShownPopup = false;
  bool _notificationsEnabled = true;

  // Alert limits. These used to be hardcoded per install (100 / 40 / 1000) and
  // disagreed with both the backend and the web dashboard. They now DEFAULT to
  // the canonical values the server publishes, and a knob only stops tracking
  // the server once the user deliberately changes it — recorded in
  // [_thresholdOverrides] so an untouched knob keeps following the standard.
  double _aqiThreshold = 100;
  double _pm25Threshold = 40;
  double _co2Threshold = 1000;
  final Set<String> _thresholdOverrides = {};

  AirQualityBands? _bands;

  Timer? _refreshTimer;
  Timer? _liveTimer;

  String get activeSensorId => _activeSensorId;
  // Live (per-frame) figures for the active sensor — these are what the UI
  // shows, updating on the ~2s live timer. '0'/'--' before the first live
  // frame arrives, same convention _fmt already uses below.
  int get aqi => _activeLive?.aqiInstant ?? 0;
  String get aqiLabel => _activeLive?.aqiLabel ?? '--';
  DateTime get lastUpdated => _activeLive?.receivedAt ?? _lastUpdated;
  List<AlertItem> get alerts => List.unmodifiable(_alerts);
  List<AlertItem> get alertHistory => List.unmodifiable(_alertHistory);
  List<SensorDevice> get sensors => List.unmodifiable(_sensors);
  double get aqiThreshold => _aqiThreshold;
  double get pm25Threshold => _pm25Threshold;
  double get co2Threshold => _co2Threshold;

  /// The canonical band table, or null until the first fetch lands.
  AirQualityBands? get bands => _bands;

  /// True when this limit is still tracking the published standard.
  bool usesServerDefault(String key) => !_thresholdOverrides.contains(key);
  bool get notificationsEnabled => _notificationsEnabled;
  int get unreadAlertCount => _alertHistory.where((a) => !a.isRead).length;
  bool get hasUnreadAlerts => unreadAlertCount > 0;
  bool get hasShownPopup => _hasShownPopup;
  bool get hasAnyDevice => _sensors.isNotEmpty;
  // Only meaningful to show prominently when there's no data yet — a
  // transient failure on a background poll after a successful initial load
  // should keep showing the last-known-good data quietly instead.
  String? get refreshError => _refreshError;

  SensorDevice get activeSensor => _sensors.firstWhere(
        (sensor) => sensor.id == _activeSensorId,
        orElse: () => SensorDevice(
          id: '',
          name: 'No sensor',
          room: 'No device registered',
          status: SensorStatus.offline,
          lastUpdated: _epoch,
          details: '',
          esp32IpAddress: '',
          esp32Endpoint: '',
          wifiName: '',
          connectionType: 'MQTT',
        ),
      );

  String get activeSensorName => activeSensor.name;
  String get activeSensorRoom => activeSensor.room;

  LiveReading? get _activeLive => _liveBySensorId[_activeSensorId];

  /// Public lookup so widgets can show per-device data without changing the active sensor.
  SensorReadings? readingFor(String sensorId) => _readingsBySensorId[sensorId];

  /// Public lookup for the live (per-frame) reading, same "absent means no
  /// data" convention as [readingFor].
  LiveReading? liveReadingFor(String sensorId) => _liveBySensorId[sensorId];

  /// Unique room names from the user's sensors, alphabetically sorted.
  List<String> get rooms {
    final set = <String>{};
    for (final s in _sensors) {
      if (s.room.trim().isNotEmpty) set.add(s.room.trim());
    }
    final list = set.toList()..sort();
    return list;
  }

  String get co2          => _fmt(_activeLive?.co2,           1, ' ppm', 0);
  String get pm1          => _fmt(_activeLive?.pm1,           1, ' µg/m³', 1);
  String get pm25         => _fmt(_activeLive?.pm25,          1, ' µg/m³', 1);
  String get pm10         => _fmt(_activeLive?.pm10,          1, ' µg/m³', 1);
  String get tvoc         => _fmt(_activeLive?.tvoc,          1, ' µg/m³', 0);
  String get formaldehyde => _fmt(_activeLive?.formaldehyde,  1, ' µg/m³', 0);
  String get temp         => _fmt(_activeLive?.temperature,   1, ' °C',   1);
  String get humidity     => _fmt(_activeLive?.humidity,      1, '%',     1);

  static String _fmt(double? v, int _, String suffix, int decimals) =>
      v == null ? '--' : '${v.toStringAsFixed(decimals)}$suffix';

  Future<void> initialize() async {
    final settings = await LocalStorageService.loadJsonMap(_settingsKey);
    _activeSensorId = settings['activeSensorId']?.toString() ?? '';
    _aqiThreshold =
        (settings['aqiThreshold'] as num?)?.toDouble() ?? _aqiThreshold;
    _pm25Threshold =
        (settings['pm25Threshold'] as num?)?.toDouble() ?? _pm25Threshold;
    _co2Threshold =
        (settings['co2Threshold'] as num?)?.toDouble() ??
        (settings['coThreshold'] as num?)?.toDouble() ??
        _co2Threshold;
    _notificationsEnabled =
        settings['notificationsEnabled'] as bool? ?? _notificationsEnabled;
    for (final key in (settings['thresholdOverrides'] as List<dynamic>? ?? const [])) {
      _thresholdOverrides.add(key.toString());
    }

    // Canonical bands first: any limit the user has NOT overridden then adopts
    // the published value instead of the old hardcoded one.
    _bands = await AirQualityBands.load(UserSession.baseUrl);
    _applyServerThresholds();

    await refreshFromBackend();
  }

  /// Adopt the served limits for every knob the user has not pinned.
  void _applyServerThresholds() {
    final limits = _bands?.limits;
    if (limits == null) return;
    if (usesServerDefault('aqi') && limits['Aqi'] != null) {
      _aqiThreshold = limits['Aqi']!;
    }
    if (usesServerDefault('pm25') && limits['PM25'] != null) {
      _pm25Threshold = limits['PM25']!;
    }
    if (usesServerDefault('co2') && limits['CO2'] != null) {
      _co2Threshold = limits['CO2']!;
    }
  }

  void startAutoRefresh({Duration interval = const Duration(seconds: 10)}) {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(interval, (_) => refreshFromBackend());
  }

  void stopAutoRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = null;
  }

  // Per-frame live reading, polled independently and much faster than the
  // 10s stored-data refresh above — GET /api/aqi/live is the same in-memory,
  // never-touches-the-database endpoint the web dashboard's fallback uses.
  // A plain poll (not SSE) is deliberate here: simpler on Flutter, and 2s is
  // already well under the sensor's own ~1s publish rate.
  void startLiveRefresh({Duration interval = const Duration(seconds: 2)}) {
    _liveTimer?.cancel();
    _liveTimer = Timer.periodic(interval, (_) => _refreshLive());
  }

  void stopLiveRefresh() {
    _liveTimer?.cancel();
    _liveTimer = null;
  }

  Future<void> _refreshLive() async {
    if (UserSession.current == null) return;
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/aqi/live');
      final res = await http
          .get(uri, headers: _authHeaders)
          .timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return;

      final json = jsonDecode(res.body) as List<dynamic>;
      _liveBySensorId.clear();
      for (final raw in json) {
        final r = raw as Map<String, dynamic>;
        final id = r['deviceId']?.toString();
        if (id == null || id.isEmpty) continue;
        final live = LiveReading.fromJson(r);
        // Absent means no data, same convention _readingsBySensorId uses —
        // a stale frame (device gone quiet) shouldn't keep showing as live.
        if (live.available && !live.stale) _liveBySensorId[id] = live;
      }
      notifyListeners();
    } catch (_) {
      // Silent on purpose: this polls every 2s, far more often than the main
      // refresh, and a transient miss shouldn't flash an error banner. The
      // UI already falls back to "No data" once entries age out above.
    }
  }

  Map<String, String> get _authHeaders {
    final token = UserSession.current?.token ?? '';
    return {
      'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  bool get isAdmin => UserSession.current?.role == 'admin';

  Future<void> refreshFromBackend() async {
    try {
      final devicesUri = Uri.parse('${UserSession.baseUrl}/api/device');
      final readingsUri = Uri.parse('${UserSession.baseUrl}/api/aqi/latest');

      final responses = await Future.wait([
        http.get(devicesUri, headers: _authHeaders).timeout(const Duration(seconds: 5)),
        http.get(readingsUri, headers: _authHeaders).timeout(const Duration(seconds: 5)),
      ]);

      if (responses[0].statusCode != 200 || responses[1].statusCode != 200) {
        _refreshError = 'Server error. Please try again.';
        notifyListeners();
        return;
      }

      final devicesJson = jsonDecode(responses[0].body) as List<dynamic>;
      final readingsJson = jsonDecode(responses[1].body) as List<dynamic>;

      // Build readings map first so status can check for data presence.
      _readingsBySensorId.clear();
      for (final raw in readingsJson) {
        final r = raw as Map<String, dynamic>;
        final id = r['deviceId']?.toString();
        if (id == null || id.isEmpty) continue;
        _readingsBySensorId[id] = SensorReadings.fromJson(r);
      }

      _sensors = devicesJson.map((raw) {
        final d = raw as Map<String, dynamic>;
        final id = d['deviceId']?.toString() ?? '';
        final lastSeen = DateTime.tryParse(d['lastSeen']?.toString() ?? '') ??
            _epoch;
        final isOnline = d['status'] == 'online' &&
            DateTime.now().difference(lastSeen) < const Duration(seconds: 30);

        final SensorStatus status;
        if (!isOnline) {
          status = SensorStatus.offline;
        } else if (_readingsBySensorId.containsKey(id)) {
          status = SensorStatus.active;
        } else {
          status = SensorStatus.available; // online but no telemetry yet
        }

        return SensorDevice(
          id: id,
          name: d['name']?.toString() ?? '',
          room: d['room']?.toString() ?? '',
          status: status,
          lastUpdated: lastSeen,
          details: '',
          esp32IpAddress: '',
          esp32Endpoint: '',
          wifiName: '',
          connectionType: 'MQTT',
          enabled: d['enabled'] as bool? ?? true,
        );
      }).toList();

      // Drop readings for offline devices so the home screen clears stale data.
      for (final sensor in _sensors) {
        if (sensor.status == SensorStatus.offline) {
          _readingsBySensorId.remove(sensor.id);
        }
      }

      if (_sensors.isNotEmpty &&
          !_sensors.any((s) => s.id == _activeSensorId)) {
        _activeSensorId = _sensors.first.id;
        await _persistSettings();
      }

      _refreshError = null;
      _syncCurrentReading(pushAlert: false);
      _rebuildAlerts();
      notifyListeners();
    } catch (e) {
      // Network/DNS error — keep last known state, but expose the failure so
      // the UI can show it when there's nothing to fall back on.
      _refreshError = 'Could not reach the server. Check your internet connection.';
      notifyListeners();
    }
  }

  Future<String?> fetchAlertHistory() async {
    try {
      final uri = Uri.parse(
          '${UserSession.baseUrl}/api/alerts/history?days=1');
      final response = await http
          .get(uri, headers: _authHeaders)
          .timeout(const Duration(seconds: 30));
      if (response.statusCode != 200) {
        return 'Server error ${response.statusCode}';
      }
      final list = jsonDecode(response.body) as List<dynamic>;
      _alertHistory = list
          .take(30)
          .map((raw) =>
              AlertItem.fromBackendHistory(raw as Map<String, dynamic>))
          .map((a) {
            a.isRead = _readHistoryKeys.contains(a.key);
            return a;
          })
          .toList();
      notifyListeners();
      return null;
    } catch (e) {
      return e.toString();
    }
  }

  void markAlertHistoryRead(String key) {
    if (_readHistoryKeys.contains(key)) return;
    _readHistoryKeys.add(key);
    for (final a in _alertHistory) {
      if (a.key == key) a.isRead = true;
    }
    notifyListeners();
  }

  Future<void> setThresholds({
    required double aqiThreshold,
    required double pm25Threshold,
    required double co2Threshold,
    required bool notificationsEnabled,
  }) async {
    // A knob counts as overridden only once it differs from the published
    // value, so saving the form without touching a slider leaves that limit
    // tracking the server.
    _markOverride('aqi', aqiThreshold, _bands?.limits['Aqi']);
    _markOverride('pm25', pm25Threshold, _bands?.limits['PM25']);
    _markOverride('co2', co2Threshold, _bands?.limits['CO2']);

    _aqiThreshold = aqiThreshold;
    _pm25Threshold = pm25Threshold;
    _co2Threshold = co2Threshold;
    _notificationsEnabled = notificationsEnabled;
    _rebuildAlerts();
    await _persistSettings();
    notifyListeners();
  }

  /// Admin-only: share a device with a user by email.
  Future<String?> shareDevice(String deviceId, String email) async {
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/device/$deviceId/share');
      final res = await http.post(
        uri,
        headers: _authHeaders,
        body: jsonEncode({'email': email}),
      ).timeout(const Duration(seconds: 5));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200) return null; // success
      return body['error']?.toString() ?? 'Failed to share device';
    } catch (e) {
      return 'Could not reach the server.';
    }
  }

  /// Admin-only: revoke a user's access to a device.
  Future<String?> unshareDevice(String deviceId, String email) async {
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/device/$deviceId/unshare');
      final res = await http.post(
        uri,
        headers: _authHeaders,
        body: jsonEncode({'email': email}),
      ).timeout(const Duration(seconds: 5));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200) return null;
      return body['error']?.toString() ?? 'Failed to revoke access';
    } catch (e) {
      return 'Could not reach the server.';
    }
  }

  /// Admin-only: send MQTT reset command to a device.
  /// Wipes Wi-Fi credentials on the ESP32 and reboots it into provisioning mode.
  Future<String?> resetDevice(String deviceId) async {
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/device/$deviceId/reset');
      final res = await http.post(uri, headers: _authHeaders).timeout(const Duration(seconds: 10));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200) return null;
      return body['error']?.toString() ?? 'Failed to send reset command';
    } catch (e) {
      return 'Could not reach the server.';
    }
  }

  /// Admin-only: soft power a device on/off via MQTT.
  /// Returns null on success, or an error message.
  Future<String?> setDevicePower(String deviceId, bool on) async {
    final uri = Uri.parse('${UserSession.baseUrl}/api/device/$deviceId/power');
    try {
      final res = await http.post(
        uri,
        headers: _authHeaders,
        body: jsonEncode({'on': on}),
      ).timeout(const Duration(seconds: 10));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200) {
        // Optimistically reflect the new state locally.
        _sensors = _sensors
            .map((s) => s.id == deviceId ? s.copyWith(enabled: on) : s)
            .toList();
        notifyListeners();
        return null;
      }
      return body['error']?.toString() ?? 'Failed to change power state';
    } catch (e) {
      return 'Could not reach the server.';
    }
  }

  /// Admin-only: rename a device or move it to a different room.
  /// Returns null on success, or an error message.
  Future<String?> updateDevice(String deviceId, String name, String room) async {
    final uri = Uri.parse('${UserSession.baseUrl}/api/device/$deviceId');
    try {
      final res = await http.patch(
        uri,
        headers: _authHeaders,
        body: jsonEncode({'name': name, 'room': room}),
      ).timeout(const Duration(seconds: 10));
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode == 200) {
        // Optimistically reflect the new name/room locally.
        _sensors = _sensors
            .map((s) => s.id == deviceId ? s.copyWith(name: name, room: room) : s)
            .toList();
        notifyListeners();
        return null;
      }
      return body['error']?.toString() ?? 'Failed to update device';
    } catch (e) {
      return 'Could not reach the server.';
    }
  }

  /// Admin-only: list users who have access to a device.
  Future<List<Map<String, dynamic>>> getDeviceUsers(String deviceId) async {
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/device/$deviceId/users');
      final res = await http.get(uri, headers: _authHeaders).timeout(const Duration(seconds: 5));
      if (res.statusCode != 200) return [];
      final list = jsonDecode(res.body) as List<dynamic>;
      return list.cast<Map<String, dynamic>>();
    } catch (e) {
      return [];
    }
  }

  Future<void> connectSensor(String sensorId) async {
    _activeSensorId = sensorId;
    _syncCurrentReading();
    await _persistSettings();
    notifyListeners();
  }

  void markPopupShown() {
    _hasShownPopup = true;
  }

  void _syncCurrentReading({bool pushAlert = true}) {
    final reading = _readingsBySensorId[_activeSensorId];
    if (reading == null) {
      _reportedAqi = 0;
      _reportedAqiLabel = '--';
      return;
    }

    final previousLabel = _reportedAqiLabel;
    _reportedAqi = reading.aqi;
    _reportedAqiLabel = reading.aqiLabel;
    _lastUpdated = reading.updatedAt;

    if (pushAlert &&
        _notificationsEnabled &&
        previousLabel != _reportedAqiLabel &&
        previousLabel != '--' &&
        previousLabel.isNotEmpty) {
      _alerts.insert(
        0,
        AlertItem(
          title: 'Air quality updated',
          message:
              '${activeSensor.room} is now $_reportedAqiLabel with AQI $_reportedAqi.',
          type: AlertType.aqi,
          createdAt: DateTime.now(),
        ),
      );
      _hasShownPopup = false;
    }

    _rebuildAlerts(keepManualAlerts: true);
  }

  void _rebuildAlerts({bool keepManualAlerts = false}) {
    final carried = keepManualAlerts
        ? _alerts.where((alert) => alert.type == AlertType.reminder).toList()
        : <AlertItem>[];

    final generated = <AlertItem>[];

    for (final sensor in _sensors) {
      final reading = _readingsBySensorId[sensor.id];
      if (reading == null) continue;

      final triggered = <String>[];
      if (reading.aqi >= _aqiThreshold) {
        triggered.add(
          'AQI ${reading.aqi} exceeds ${_aqiThreshold.toStringAsFixed(0)}',
        );
      }
      if (reading.pm25 >= _pm25Threshold) {
        triggered.add(
          'PM2.5 ${reading.pm25.toStringAsFixed(1)} exceeds ${_pm25Threshold.toStringAsFixed(0)}',
        );
      }
      if (reading.co2 >= _co2Threshold) {
        triggered.add(
          'CO2 ${reading.co2.toStringAsFixed(0)} exceeds ${_co2Threshold.toStringAsFixed(0)}',
        );
      }

      if (triggered.isEmpty) continue;

      final level = triggered.length >= 2
          ? 'High Alert'
          : reading.aqi >= 150
              ? 'High Alert'
              : 'Warning';

      generated.add(
        AlertItem(
          title: '$level - ${sensor.room}',
          message: triggered.join(' | '),
          type: AlertType.aqi,
          createdAt: sensor.lastUpdated,
          isRead: false,
        ),
      );
    }

    _alerts
      ..clear()
      ..addAll(generated)
      ..addAll(
        carried.isNotEmpty
            ? carried
            : NotificationService.getMockAlerts().where(
                (a) => a.type == AlertType.reminder,
              ),
      );
  }

  void _markOverride(String key, double value, double? serverValue) {
    if (serverValue != null && value == serverValue) {
      _thresholdOverrides.remove(key);
    } else {
      _thresholdOverrides.add(key);
    }
  }

  Future<void> _persistSettings() async {
    await LocalStorageService.saveJsonMap(_settingsKey, {
      'activeSensorId': _activeSensorId,
      'aqiThreshold': _aqiThreshold,
      'pm25Threshold': _pm25Threshold,
      'co2Threshold': _co2Threshold,
      'thresholdOverrides': _thresholdOverrides.toList(),
      'notificationsEnabled': _notificationsEnabled,
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _liveTimer?.cancel();
    super.dispose();
  }
}

final DateTime _epoch = DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);

// DENR category name for an AQI index. Reads the served table when it is
// loaded; the fallback below mirrors it for the window before the first fetch.
String _aqiLabelFromValue(int aqi) {
  final served = AirQualityBands.current?.categoryFor(aqi)?.name;
  if (served != null) return served;

  if (aqi <= 50)  return 'Good';
  if (aqi <= 100) return 'Fair';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Very Unhealthy';
  if (aqi <= 300) return 'Acutely Unhealthy';
  return 'Emergency';
}

class SensorReadings {
  final int aqi;
  final String aqiLabel;
  final double pm1;
  final double pm25;
  final double pm10;
  final double tvoc;
  final double co2;
  final double formaldehyde;
  final double temperature;
  final double humidity;
  final DateTime updatedAt;

  const SensorReadings({
    required this.aqi,
    required this.aqiLabel,
    required this.pm1,
    required this.pm25,
    required this.pm10,
    required this.tvoc,
    required this.co2,
    required this.formaldehyde,
    required this.temperature,
    required this.humidity,
    required this.updatedAt,
  });

  factory SensorReadings.fromJson(Map<String, dynamic> json) {
    final aqiVal = (json['Aqi'] as num?)?.toInt() ?? 0;
    return SensorReadings(
      aqi: aqiVal,
      aqiLabel: _aqiLabelFromValue(aqiVal),
      pm1:          (json['PM1']          as num?)?.toDouble() ?? 0,
      pm25:         (json['PM25']         as num?)?.toDouble() ?? 0,
      pm10:         (json['PM10']         as num?)?.toDouble() ?? 0,
      tvoc:         (json['TVOC']         as num?)?.toDouble() ?? 0,
      co2:          (json['CO2']          as num?)?.toDouble() ?? 0,
      formaldehyde: (json['Formaldehyde'] as num?)?.toDouble() ?? 0,
      temperature:  (json['Temperature']  as num?)?.toDouble() ?? 0,
      humidity:     (json['Humidity']     as num?)?.toDouble() ?? 0,
      updatedAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}

/// A single per-frame reading from GET /api/aqi/live — the sensor's raw,
/// unaveraged frame, not the 12-hour reported figure [SensorReadings] holds.
/// [aqiInstant] is that one frame's AQI, jitter and all — that's the point.
class LiveReading {
  final bool available;
  final bool stale;
  final int aqiInstant;
  final String aqiLabel;
  final double pm1;
  final double pm25;
  final double pm10;
  final double tvoc;
  final double co2;
  final double formaldehyde;
  final double temperature;
  final double humidity;
  final DateTime receivedAt;

  const LiveReading({
    required this.available,
    required this.stale,
    required this.aqiInstant,
    required this.aqiLabel,
    required this.pm1,
    required this.pm25,
    required this.pm10,
    required this.tvoc,
    required this.co2,
    required this.formaldehyde,
    required this.temperature,
    required this.humidity,
    required this.receivedAt,
  });

  factory LiveReading.fromJson(Map<String, dynamic> json) {
    final available = json['available'] == true;
    final metrics = json['metrics'] as Map<String, dynamic>? ?? const {};
    final aqiVal = (json['aqiInstant'] as num?)?.toInt() ?? 0;
    return LiveReading(
      available: available,
      stale: json['stale'] == true,
      aqiInstant: aqiVal,
      aqiLabel: available ? _aqiLabelFromValue(aqiVal) : '--',
      pm1:          (metrics['PM1']          as num?)?.toDouble() ?? 0,
      pm25:         (metrics['PM25']         as num?)?.toDouble() ?? 0,
      pm10:         (metrics['PM10']         as num?)?.toDouble() ?? 0,
      tvoc:         (metrics['TVOC']         as num?)?.toDouble() ?? 0,
      co2:          (metrics['CO2']          as num?)?.toDouble() ?? 0,
      formaldehyde: (metrics['Formaldehyde'] as num?)?.toDouble() ?? 0,
      temperature:  (metrics['Temperature']  as num?)?.toDouble() ?? 0,
      humidity:     (metrics['Humidity']     as num?)?.toDouble() ?? 0,
      receivedAt: DateTime.tryParse(json['receivedAt']?.toString() ?? '') ??
          DateTime.now(),
    );
  }
}
