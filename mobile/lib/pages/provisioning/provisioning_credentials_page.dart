import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:wifi_iot/wifi_iot.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'provisioning_naming_page.dart';

const String _esp32ProvisionUrl = 'http://192.168.4.1/provision';
const String _kLastSsid = 'last_wifi_ssid';

class ProvisioningCredentialsPage extends StatefulWidget {
  final String deviceId;
  // Optionally pre-fill the SSID (e.g. the network the phone was on).
  final String? prefillSsid;

  const ProvisioningCredentialsPage({
    super.key,
    required this.deviceId,
    this.prefillSsid,
  });

  @override
  State<ProvisioningCredentialsPage> createState() =>
      _ProvisioningCredentialsPageState();
}

class _ProvisioningCredentialsPageState
    extends State<ProvisioningCredentialsPage> {
  final _ssidCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _submitting = false;
  bool _hidePassword = true;
  String? _error;
  bool _leaving = false;

  // Nearby networks for the picker.
  List<WifiNetwork> _networks = [];
  bool _scanningNetworks = false;

  @override
  void initState() {
    super.initState();
    _loadSavedCredentials();
    _scanNetworks();
  }

  // Scan for nearby Wi-Fi networks so the user can pick instead of typing.
  // Works even while bound to the sensor AP — scanning is hardware-level.
  Future<void> _scanNetworks() async {
    if (_scanningNetworks) return;
    setState(() => _scanningNetworks = true);
    try {
      final list = await WiFiForIoTPlugin.loadWifiList();
      // Drop BewAir APs and blanks, dedupe by SSID (keep strongest signal),
      // then sort by signal strength.
      final bySsid = <String, WifiNetwork>{};
      for (final n in list) {
        final ssid = (n.ssid ?? '').trim();
        if (ssid.isEmpty) continue;
        if (ssid.toUpperCase().startsWith('BEWAIR-')) continue;
        final existing = bySsid[ssid];
        if (existing == null || (n.level ?? -999) > (existing.level ?? -999)) {
          bySsid[ssid] = n;
        }
      }
      final result = bySsid.values.toList()
        ..sort((a, b) => (b.level ?? -999).compareTo(a.level ?? -999));
      if (!mounted) return;
      setState(() {
        _networks = result;
        _scanningNetworks = false;
      });
    } catch (_) {
      if (mounted) setState(() => _scanningNetworks = false);
    }
  }

  // Is this network on the 2.4 GHz band? (frequency in MHz)
  bool _is24ghz(WifiNetwork n) {
    final f = n.frequency ?? 0;
    return f > 0 && f < 2500;
  }

  void _openNetworkPicker() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (sheetCtx) {
        return StatefulBuilder(
          builder: (ctx, setSheet) {
            return SizedBox(
              height: MediaQuery.of(ctx).size.height * 0.6,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                          child: Text(
                            'Choose a Wi-Fi network',
                            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Rescan',
                          icon: _scanningNetworks
                              ? const SizedBox(
                                  width: 18, height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.refresh),
                          onPressed: _scanningNetworks
                              ? null
                              : () async {
                                  await _scanNetworks();
                                  setSheet(() {});
                                },
                        ),
                      ],
                    ),
                    const Text(
                      'The sensor needs a 2.4 GHz network. 5 GHz networks are marked and won\'t work.',
                      style: TextStyle(color: Colors.black54, fontSize: 12),
                    ),
                    const SizedBox(height: 8),
                    Expanded(
                      child: _networks.isEmpty
                          ? Center(
                              child: Text(
                                _scanningNetworks
                                    ? 'Scanning...'
                                    : 'No networks found. Tap refresh or enter manually.',
                                style: const TextStyle(color: Colors.black54),
                              ),
                            )
                          : ListView.separated(
                              itemCount: _networks.length,
                              separatorBuilder: (_, _) =>
                                  const Divider(height: 1),
                              itemBuilder: (c, i) {
                                final n = _networks[i];
                                final ssid = n.ssid ?? '';
                                final is24 = _is24ghz(n);
                                return ListTile(
                                  leading: Icon(
                                    (n.level ?? -100) >= -65
                                        ? Icons.wifi
                                        : (n.level ?? -100) >= -78
                                            ? Icons.wifi_2_bar
                                            : Icons.wifi_1_bar,
                                    color: const Color(0xFF1E5BFF),
                                  ),
                                  title: Text(ssid,
                                      style: const TextStyle(fontWeight: FontWeight.w600)),
                                  subtitle: Text(is24 ? '2.4 GHz' : '5 GHz — not supported'),
                                  trailing: is24
                                      ? const Icon(Icons.chevron_right)
                                      : const Icon(Icons.block, color: Colors.redAccent),
                                  enabled: is24,
                                  onTap: () {
                                    _ssidCtrl.text = ssid;
                                    Navigator.of(sheetCtx).pop();
                                    setState(() {});
                                  },
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  // Pre-fill the SSID from the last successful provision, falling back to the
  // network the phone was on. The password is NEVER remembered — always typed.
  Future<void> _loadSavedCredentials() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedSsid = prefs.getString(_kLastSsid);
      if (!mounted) return;
      setState(() {
        _ssidCtrl.text = (savedSsid?.isNotEmpty == true)
            ? savedSsid!
            : (widget.prefillSsid ?? '');
      });
    } catch (_) {
      if (mounted && widget.prefillSsid != null) {
        setState(() => _ssidCtrl.text = widget.prefillSsid!);
      }
    }
  }

  @override
  void dispose() {
    _ssidCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_ssidCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Wi-Fi name is required.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final res = await http
          .post(
            Uri.parse(_esp32ProvisionUrl),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'ssid': _ssidCtrl.text.trim(),
              'password': _passCtrl.text,
            }),
          )
          .timeout(const Duration(seconds: 8));

      if (res.statusCode != 200) {
        setState(() {
          _submitting = false;
          _error = 'Sensor rejected the credentials (${res.statusCode}).';
        });
        return;
      }

      // Remember only the SSID so the next sensor on the same network pre-fills
      // it automatically. The password is intentionally never stored.
      try {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(_kLastSsid, _ssidCtrl.text.trim());
      } catch (_) {/* ignore */}

      // Credentials accepted. Release the forced binding to the ESP32 hotspot
      // (if the auto-connect flow set it) so the phone returns to its normal
      // network and the naming page can reach the backend. Safe to call even
      // if the user joined the AP manually.
      try {
        await WiFiForIoTPlugin.forceWifiUsage(false);
        await WiFiForIoTPlugin.disconnect();
      } catch (_) {/* ignore — manual flow / unsupported */}

      // Sensor will reboot now. Give it a moment to drop the AP and the phone
      // to reconnect to normal Wi-Fi, then go to naming.
      await Future.delayed(const Duration(seconds: 8));
      if (!mounted) return;
      await Navigator.of(context).pushReplacement(
        MaterialPageRoute(
          builder: (_) => ProvisioningNamingPage(deviceId: widget.deviceId),
        ),
      );
    } catch (e) {
      setState(() {
        _submitting = false;
        _error =
            'Could not reach the sensor. Are you still joined to the BewAir network?';
      });
    }
  }

  // If the user backs out of this page (system gesture, back button, or the
  // AppBar arrow) without submitting, the phone is still force-bound to the
  // sensor's internet-less setup network (set by ProvisioningScanPage before
  // reaching here). Release that binding on the way out so the phone doesn't
  // silently lose normal internet access. Ignored while a submit is in
  // flight — the success path already releases it itself.
  Future<void> _handleBackNavigation(bool didPop, Object? result) async {
    if (didPop || _leaving || _submitting) return;
    _leaving = true;
    try {
      await WiFiForIoTPlugin.forceWifiUsage(false);
    } catch (_) {/* ignore — manual flow / unsupported */}
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: _handleBackNavigation,
      child: Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E5BFF),
        foregroundColor: Colors.white,
        title: const Text('Wi-Fi Credentials'),
      ),
      body: AbsorbPointer(
        absorbing: _submitting,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Sensor found: ${widget.deviceId}',
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF1E5BFF),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                "Connect to your BewAir Sensor via Wi-Fi (must be 2.4 GHz)",
                style: TextStyle(color: Colors.black54, height: 1.4),
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _ssidCtrl,
                readOnly: true,
                onTap: _openNetworkPicker,
                decoration: InputDecoration(
                  labelText: 'Wi-Fi name (SSID)',
                  hintText: 'Tap to choose a network',
                  prefixIcon: const Icon(Icons.wifi),
                  suffixIcon: IconButton(
                    tooltip: 'Choose Wi-Fi network',
                    icon: _scanningNetworks
                        ? const SizedBox(
                            width: 18, height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.expand_more),
                    onPressed: _openNetworkPicker,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
              // Fallback: let the user type a hidden/undetected SSID manually.
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: () {
                    showDialog<void>(
                      context: context,
                      builder: (dctx) {
                        final ctrl = TextEditingController(text: _ssidCtrl.text);
                        return AlertDialog(
                          title: const Text('Enter network name'),
                          content: TextField(
                            controller: ctrl,
                            autofocus: true,
                            decoration: const InputDecoration(
                              labelText: 'Wi-Fi name (SSID)',
                            ),
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(dctx),
                              child: const Text('Cancel'),
                            ),
                            TextButton(
                              onPressed: () {
                                setState(() => _ssidCtrl.text = ctrl.text.trim());
                                Navigator.pop(dctx);
                              },
                              child: const Text('Use this'),
                            ),
                          ],
                        );
                      },
                    );
                  },
                  child: const Text('Enter manually (hidden network)'),
                ),
              ),
              const SizedBox(height: 4),
              TextField(
                controller: _passCtrl,
                obscureText: _hidePassword,
                decoration: InputDecoration(
                  labelText: 'Password',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  suffixIcon: IconButton(
                    tooltip: _hidePassword ? 'Show password' : 'Hide password',
                    icon: Icon(
                      _hidePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                    onPressed: () =>
                        setState(() => _hidePassword = !_hidePassword),
                  ),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(_error!, style: const TextStyle(color: Colors.red)),
              ],
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF1E5BFF),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            ),
                            SizedBox(width: 12),
                            Text('Configuring sensor...'),
                          ],
                        )
                      : const Text('Send to Sensor'),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
      ),
    );
  }
}
