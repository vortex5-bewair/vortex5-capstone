import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'provisioning_credentials_page.dart';

const String _esp32GatewayUrl = 'http://192.168.4.1';

class ProvisioningInstructionsPage extends StatefulWidget {
  const ProvisioningInstructionsPage({super.key});

  @override
  State<ProvisioningInstructionsPage> createState() =>
      _ProvisioningInstructionsPageState();
}

class _ProvisioningInstructionsPageState
    extends State<ProvisioningInstructionsPage> {
  Timer? _pollTimer;
  bool _detecting = false;

  @override
  void initState() {
    super.initState();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 2),
      (_) => _checkForDevice(),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _checkForDevice() async {
    if (_detecting) return;
    _detecting = true;
    try {
      final res = await http
          .get(Uri.parse('$_esp32GatewayUrl/info'))
          .timeout(const Duration(seconds: 2));
      if (res.statusCode == 200) {
        final body = jsonDecode(res.body) as Map<String, dynamic>;
        final deviceId = body['deviceId']?.toString() ?? '';
        if (deviceId.isNotEmpty && mounted) {
          _pollTimer?.cancel();
          await Navigator.of(context).pushReplacement(
            MaterialPageRoute(
              builder: (_) =>
                  ProvisioningCredentialsPage(deviceId: deviceId),
            ),
          );
        }
      }
    } catch (_) {
      // not on the AP yet; ignore and keep polling
    } finally {
      _detecting = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E5BFF),
        foregroundColor: Colors.white,
        title: const Text('Add Device'),
      ),
      body: const Padding(
        padding: EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Connect to your sensor',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
            ),
            SizedBox(height: 8),
            Text(
              "Power on your BewAir sensor. On its first boot it broadcasts a "
              "Wi-Fi network you can join from your phone.",
              style: TextStyle(color: Colors.black54, height: 1.4),
            ),
            SizedBox(height: 24),
            _Step(
              number: '1',
              title: 'Open Wi-Fi settings',
              body: "Go to your phone's Wi-Fi settings.",
            ),
            _Step(
              number: '2',
              title: 'Join the BewAir network',
              body:
                  'Look for a network starting with "BewAir-" and connect '
                  '(no password needed). Stay connected even if your phone '
                  'says "no internet".',
            ),
            _Step(
              number: '3',
              title: 'Come back here',
              body:
                  'This screen will detect the sensor automatically and move '
                  'on to the next step.',
            ),
            Spacer(),
            Center(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 12),
                  Text(
                    'Looking for sensor...',
                    style: TextStyle(color: Colors.black54),
                  ),
                ],
              ),
            ),
            SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  final String number;
  final String title;
  final String body;

  const _Step({
    required this.number,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: const BoxDecoration(
              color: Color(0xFF1E5BFF),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Text(
              number,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(color: Colors.black54, height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
