import 'package:flutter/material.dart';
import '../models/user_session.dart';
import '../utils/validators.dart';
import '../widgets/password_requirements.dart';
import 'verify_code_page.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  static const _departments = [
    'Science Department',
    'Mathematics Department',
    'English Department',
    'Social Studies Department',
    'ICT Department',
  ];

  static const _staffTypes = ['Teacher', 'Student Teacher'];

  final _firstCtrl = TextEditingController();
  final _lastCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _teacherIdCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();

  String? _selectedDepartment;
  String? _selectedStaffType;
  bool _showPass = false;
  bool _showConfirm = false;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _passCtrl.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _firstCtrl.dispose();
    _lastCtrl.dispose();
    _emailCtrl.dispose();
    _teacherIdCtrl.dispose();
    _passCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _continue() async {
    final first = _firstCtrl.text.trim();
    final last = _lastCtrl.text.trim();
    final email = _emailCtrl.text.trim();
    final teacherId = _teacherIdCtrl.text.trim();
    final pass = _passCtrl.text.trim();
    final confirm = _confirmCtrl.text.trim();
    final department = _selectedDepartment ?? '';
    final staffType = _selectedStaffType ?? '';

    if (first.isEmpty ||
        last.isEmpty ||
        email.isEmpty ||
        teacherId.isEmpty ||
        department.isEmpty ||
        staffType.isEmpty ||
        pass.isEmpty ||
        confirm.isEmpty) {
      _showMessage("Please fill out all fields.");
      return;
    }

    if (!isValidEmail(email)) {
      _showMessage("Please enter a valid email address.");
      return;
    }

    if (pass != confirm) {
      _showMessage("Passwords do not match.");
      return;
    }

    final passErr = UserSession.validateStrongPassword(pass);
    if (passErr != null) {
      _showMessage(passErr);
      return;
    }

    setState(() => _submitting = true);

    final err = await UserSession.sendSignupCode(email);

    if (!mounted) return;

    setState(() => _submitting = false);

    if (err != null) {
      _showMessage(err);
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => VerifyCodePage(
          firstName: first,
          lastName: last,
          email: email,
          password: pass,
          teacherId: teacherId,
          department: department,
          staffType: staffType,
        ),
      ),
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF4FAF6),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          tooltip: 'Back',
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: Color(0xFF1E5BFF)),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(28),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x140F172A),
                      blurRadius: 28,
                      offset: Offset(0, 16),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Image.asset(
                            'assets/images/bewair_logo_black.png',
                            width: 62,
                            height: 62,
                            fit: BoxFit.contain,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Register',
                                style: TextStyle(
                                  fontSize: 28,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF111827),
                                ),
                              ),
                              SizedBox(height: 4),
                              Text(
                                'Create your BewAir account',
                                style: TextStyle(color: Color(0xFF64748B)),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),
                    _label("First name"),
                    TextField(
                      controller: _firstCtrl,
                      decoration: _fieldDeco(hint: 'Juan'),
                    ),
                    const SizedBox(height: 14),
                    _label("Last name"),
                    TextField(
                      controller: _lastCtrl,
                      decoration: _fieldDeco(hint: 'Dela Cruz'),
                    ),
                    const SizedBox(height: 14),
                    _label("Email"),
                    TextField(
                      controller: _emailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      decoration: _fieldDeco(hint: 'teacher@school.edu'),
                    ),
                    const SizedBox(height: 14),
                    _label("Teacher ID number"),
                    TextField(
                      controller: _teacherIdCtrl,
                      decoration: _fieldDeco(hint: 'TCHR-2026-001'),
                    ),
                    const SizedBox(height: 14),
                    _label("Department"),
                    DropdownButtonFormField<String>(
                      initialValue: _selectedDepartment,
                      decoration: _fieldDeco(hint: 'Select department'),
                      items: _departments
                          .map(
                            (department) => DropdownMenuItem(
                              value: department,
                              child: Text(department),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        setState(() => _selectedDepartment = value);
                      },
                    ),
                    const SizedBox(height: 14),
                    _label("Staff Type"),
                    DropdownButtonFormField<String>(
                      initialValue: _selectedStaffType,
                      decoration: _fieldDeco(hint: 'Select staff type'),
                      items: _staffTypes
                          .map(
                            (staffType) => DropdownMenuItem(
                              value: staffType,
                              child: Text(staffType),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        setState(() => _selectedStaffType = value);
                      },
                    ),
                    const SizedBox(height: 14),
                    _label("Password"),
                    TextField(
                      controller: _passCtrl,
                      obscureText: !_showPass,
                      decoration: _fieldDeco(
                        hint: 'Create a strong password',
                        suffix: IconButton(
                          tooltip:
                              _showPass ? 'Hide password' : 'Show password',
                          onPressed: () =>
                              setState(() => _showPass = !_showPass),
                          icon: Icon(
                            _showPass ? Icons.visibility_off : Icons.visibility,
                          ),
                        ),
                      ),
                    ),
                    if (_passCtrl.text.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      PasswordRequirements(password: _passCtrl.text),
                    ],
                    const SizedBox(height: 14),
                    _label("Confirm password"),
                    TextField(
                      controller: _confirmCtrl,
                      obscureText: !_showConfirm,
                      decoration: _fieldDeco(
                        hint: 'Confirm password',
                        suffix: IconButton(
                          tooltip: _showConfirm
                              ? 'Hide password'
                              : 'Show password',
                          onPressed: () =>
                              setState(() => _showConfirm = !_showConfirm),
                          icon: Icon(
                            _showConfirm
                                ? Icons.visibility_off
                                : Icons.visibility,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      height: 54,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _continue,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF1E88FF),
                          foregroundColor: Colors.white,
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16),
                          ),
                        ),
                        child: _submitting
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Text(
                                "Continue",
                                style: TextStyle(fontWeight: FontWeight.w700),
                              ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  static Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text,
      style: const TextStyle(
        fontWeight: FontWeight.w600,
        color: Color(0xFF111827),
      ),
    ),
  );

  static InputDecoration _fieldDeco({String? hint, Widget? suffix}) {
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
      suffixIcon: suffix,
    );
  }
}
