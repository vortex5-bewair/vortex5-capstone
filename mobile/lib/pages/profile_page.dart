import 'dart:io';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import '../models/user_session.dart';
import '../widgets/role_badge.dart';
import 'about_page.dart';
import 'help_page.dart';
import 'login_page.dart';
import 'settings_page.dart';
import 'user_management_page.dart';
import 'view_profile_page.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  static const _blue = Color(0xFF1E5BFF);

  bool _uploadingPicture = false;

  Future<void> _changePicture() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 18, 20, 6),
              child: Text(
                'Change Profile Photo',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined, color: _blue),
              title: const Text('Take Photo'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: _blue),
              title: const Text('Choose from Gallery'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (source == null) return;

    final picked = await ImagePicker().pickImage(
      source: source,
      maxWidth: 800,
      imageQuality: 80,
    );

    if (picked == null) return;
    if (!mounted) return;

    final messenger = ScaffoldMessenger.of(context);

    setState(() => _uploadingPicture = true);

    final err = await UserSession.uploadProfilePicture(File(picked.path));

    if (!mounted) return;
    setState(() => _uploadingPicture = false);

    if (err != null) {
      messenger.showSnackBar(SnackBar(content: Text(err)));
      return;
    }

    setState(() {});
  }

  Future<void> _signOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will be returned to the login screen.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out',
                style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await UserSession.logout();
    if (!mounted) return;
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final u = UserSession.current;
    final fullName =
        u == null ? '' : '${u.firstName} ${u.lastName}'.trim();
    final email = u?.email ?? '';
    final role = u?.role ?? '';

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: _blue,
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
              'Profile',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 22,
                letterSpacing: 1.4,
              ),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          // ── Plain identity header (no card) ───────────────────────────
          Row(
            children: [
              _avatar(u?.pictureUrl),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      fullName.isEmpty ? 'No name set' : fullName,
                      style: GoogleFonts.poppins(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        color: const Color(0xFF0F172A),
                      ),
                    ),
                    if (email.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(email,
                          style: GoogleFonts.inter(
                              color: const Color(0xFF64748B), fontSize: 13)),
                    ],
                    if (role.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      RoleBadge(role: role),
                    ],
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 28),

          // ── Flat menu list ─────────────────────────────────────────────
          _menuRow(
            icon: Icons.person_outline_rounded,
            label: 'View Profile',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ViewProfilePage()),
            ).then((_) => setState(() {})),
          ),
          const Divider(height: 1, indent: 40),
          _menuRow(
            icon: Icons.settings_outlined,
            label: 'Settings',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const SettingsPage()),
            ).then((_) => setState(() {})),
          ),
          const Divider(height: 1, indent: 40),
          if (role == 'admin') ...[
            _menuRow(
              icon: Icons.manage_accounts_outlined,
              label: 'User Management',
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const UserManagementPage()),
              ),
            ),
            const Divider(height: 1, indent: 40),
          ],
          _menuRow(
            icon: Icons.help_outline_rounded,
            label: 'Help & Support',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const HelpPage()),
            ),
          ),
          const Divider(height: 1, indent: 40),
          _menuRow(
            icon: Icons.info_outline_rounded,
            label: 'About',
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const AboutPage()),
            ),
          ),
          const Divider(height: 1, indent: 40),

          const SizedBox(height: 40),

          // ── Sign out — plain, unboxed ───────────────────────────────────
          InkWell(
            onTap: _signOut,
            child: Container(
              constraints: const BoxConstraints(minHeight: 48),
              alignment: Alignment.centerLeft,
              child: Text(
                'Sign out',
                style: GoogleFonts.inter(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: const Color(0xFF0F172A),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  Widget _avatar(String? pictureUrl) {
    final initials = _initials();
    final resolvedUrl = _resolvePictureUrl(pictureUrl);

    return GestureDetector(
      onTap: _changePicture,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          CircleAvatar(
            radius: 30,
            backgroundColor: const Color(0xFF6988FF),
            backgroundImage:
                resolvedUrl != null ? NetworkImage(resolvedUrl) : null,
            onBackgroundImageError:
                resolvedUrl != null ? (_, _) {} : null,
            child: resolvedUrl == null
                ? Text(
                    initials,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 16),
                  )
                : null,
          ),
          if (_uploadingPicture)
            Positioned.fill(
              child: CircleAvatar(
                radius: 30,
                backgroundColor: Colors.black.withValues(alpha: 0.45),
                child: const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          Positioned(
            right: -2,
            bottom: -2,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFF355CFF), width: 1.5),
              ),
              child: const Icon(Icons.camera_alt_rounded,
                  size: 11, color: Color(0xFF355CFF)),
            ),
          ),
        ],
      ),
    );
  }

  /// Backend stores picture paths as `/uploads/<filename>` (relative) — this
  /// prefixes them with the API base URL so NetworkImage can load them.
  String? _resolvePictureUrl(String? pictureUrl) {
    if (pictureUrl == null || pictureUrl.trim().isEmpty) return null;
    if (pictureUrl.startsWith('http')) return pictureUrl;
    return '${UserSession.baseUrl}$pictureUrl';
  }

  Widget _menuRow({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(icon, color: _blue),
      title: Text(label,
          style: GoogleFonts.inter(
              fontWeight: FontWeight.w600, fontSize: 15, color: const Color(0xFF0F172A))),
      trailing: const Icon(Icons.chevron_right_rounded,
          size: 18, color: Color(0xFFCBD5E1)),
      onTap: onTap,
    );
  }

  String _initials() {
    final u = UserSession.current;
    if (u == null) return 'U';
    final a = u.firstName.trim().isNotEmpty ? u.firstName.trim()[0] : '';
    final b = u.lastName.trim().isNotEmpty ? u.lastName.trim()[0] : '';
    final result = (a + b).toUpperCase();
    return result.isEmpty ? 'U' : result;
  }
}
