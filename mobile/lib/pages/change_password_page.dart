import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/user_session.dart';
import '../widgets/password_requirements.dart';

class ChangePasswordPage extends StatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  State<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends State<ChangePasswordPage> {
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  bool _showCurrent = false;
  bool _showNew = false;
  bool _showConfirm = false;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _newCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _update() async {
    final messenger = ScaffoldMessenger.of(context);

    if (_currentCtrl.text.trim().isEmpty ||
        _newCtrl.text.trim().isEmpty ||
        _confirmCtrl.text.trim().isEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Please complete all password fields.')),
      );
      return;
    }

    setState(() => _saving = true);

    final message = await UserSession.changePassword(
      currentPassword: _currentCtrl.text,
      newPassword: _newCtrl.text,
      confirmPassword: _confirmCtrl.text,
    );

    if (!mounted) return;
    setState(() => _saving = false);

    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
      return;
    }

    Navigator.pop(context);
    messenger.showSnackBar(
      const SnackBar(content: Text('Password updated successfully.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text('Change Password',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          _label('Current Password'),
          TextField(
            controller: _currentCtrl,
            obscureText: !_showCurrent,
            decoration: _fieldDeco(
              suffix: IconButton(
                tooltip: _showCurrent ? 'Hide password' : 'Show password',
                onPressed: () => setState(() => _showCurrent = !_showCurrent),
                icon: Icon(_showCurrent ? Icons.visibility_off : Icons.visibility),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _label('New Password'),
          TextField(
            controller: _newCtrl,
            obscureText: !_showNew,
            decoration: _fieldDeco(
              suffix: IconButton(
                tooltip: _showNew ? 'Hide password' : 'Show password',
                onPressed: () => setState(() => _showNew = !_showNew),
                icon: Icon(_showNew ? Icons.visibility_off : Icons.visibility),
              ),
            ),
          ),
          if (_newCtrl.text.isNotEmpty) ...[
            const SizedBox(height: 10),
            PasswordRequirements(password: _newCtrl.text),
          ],
          const SizedBox(height: 16),
          _label('Confirm Password'),
          TextField(
            controller: _confirmCtrl,
            obscureText: !_showConfirm,
            decoration: _fieldDeco(
              suffix: IconButton(
                tooltip: _showConfirm ? 'Hide password' : 'Show password',
                onPressed: () => setState(() => _showConfirm = !_showConfirm),
                icon: Icon(_showConfirm ? Icons.visibility_off : Icons.visibility),
              ),
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _saving ? null : _update,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E88FF),
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: _saving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : const Text('Update Password', style: TextStyle(fontWeight: FontWeight.w700)),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          text,
          style: GoogleFonts.inter(fontWeight: FontWeight.w600, color: const Color(0xFF111827)),
        ),
      );

  static InputDecoration _fieldDeco({Widget? suffix}) {
    return InputDecoration(
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFFD8E4EA)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: const BorderSide(color: Color(0xFF1E88FF), width: 1.4),
      ),
      suffixIcon: suffix,
    );
  }
}
