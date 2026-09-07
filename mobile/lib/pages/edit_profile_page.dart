import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/user_session.dart';

class EditProfilePage extends StatefulWidget {
  const EditProfilePage({super.key});

  @override
  State<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends State<EditProfilePage> {
  static const _departments = [
    'Science Department',
    'Mathematics Department',
    'English Department',
    'Social Studies Department',
    'ICT Department',
  ];

  static const _staffTypes = ['Teacher', 'Student Teacher'];

  late final TextEditingController _firstCtrl;
  late final TextEditingController _lastCtrl;
  late final TextEditingController _emailCtrl;
  String? _department;
  String? _staffType;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final user = UserSession.current;
    _firstCtrl = TextEditingController(text: user?.firstName ?? '');
    _lastCtrl = TextEditingController(text: user?.lastName ?? '');
    _emailCtrl = TextEditingController(text: user?.email ?? '');
    _department = (user?.department ?? '').isEmpty ? null : user!.department;
    _staffType = (user?.staffType ?? '').isEmpty ? null : user!.staffType;
  }

  @override
  void dispose() {
    _firstCtrl.dispose();
    _lastCtrl.dispose();
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final messenger = ScaffoldMessenger.of(context);

    if (_firstCtrl.text.trim().isEmpty ||
        _lastCtrl.text.trim().isEmpty ||
        _emailCtrl.text.trim().isEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Name and email are required.')),
      );
      return;
    }

    setState(() => _saving = true);

    final message = await UserSession.updateProfile(
      firstName: _firstCtrl.text,
      lastName: _lastCtrl.text,
      email: _emailCtrl.text,
      department: _department ?? '',
      staffType: _staffType ?? '',
    );

    if (!mounted) return;
    setState(() => _saving = false);

    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
      return;
    }

    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text('Edit Profile',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          _label('First name'),
          TextField(controller: _firstCtrl, decoration: _fieldDeco()),
          const SizedBox(height: 16),
          _label('Last name'),
          TextField(controller: _lastCtrl, decoration: _fieldDeco()),
          const SizedBox(height: 16),
          _label('Email'),
          TextField(
            controller: _emailCtrl,
            keyboardType: TextInputType.emailAddress,
            readOnly: true,
            decoration: _fieldDeco().copyWith(
              fillColor: const Color(0xFFEEF2F5),
            ),
            style: const TextStyle(color: Color(0xFF64748B)),
          ),
          const SizedBox(height: 16),
          _label('Department'),
          DropdownButtonFormField<String>(
            initialValue: _department,
            decoration: _fieldDeco(hint: 'Select department'),
            items: _departments
                .map((d) => DropdownMenuItem(value: d, child: Text(d)))
                .toList(),
            onChanged: (value) => setState(() => _department = value),
          ),
          const SizedBox(height: 16),
          _label('Staff Type'),
          DropdownButtonFormField<String>(
            initialValue: _staffType,
            decoration: _fieldDeco(hint: 'Select staff type'),
            items: _staffTypes
                .map((s) => DropdownMenuItem(value: s, child: Text(s)))
                .toList(),
            onChanged: (value) => setState(() => _staffType = value),
          ),
          const SizedBox(height: 28),
          SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _saving ? null : _save,
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
                  : const Text('Save Changes', style: TextStyle(fontWeight: FontWeight.w700)),
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

  static InputDecoration _fieldDeco({String? hint}) {
    return InputDecoration(
      hintText: hint,
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
    );
  }
}
