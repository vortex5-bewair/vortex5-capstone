import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../models/user_session.dart';
import '../widgets/role_badge.dart';

class UserManagementPage extends StatefulWidget {
  const UserManagementPage({super.key});

  @override
  State<UserManagementPage> createState() => _UserManagementPageState();
}

class _UserManagementPageState extends State<UserManagementPage> {
  static const _blue = Color(0xFF1E5BFF);

  List<Map<String, dynamic>> _users = [];
  bool _loading = true;
  String? _error;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await UserSession.fetchAllUsers();
      if (!mounted) return;
      setState(() {
        _users = users;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to load users.';
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> get _filteredUsers {
    if (_search.trim().isEmpty) return _users;
    final q = _search.trim().toLowerCase();
    return _users.where((u) {
      final name = '${u['firstName'] ?? ''} ${u['lastName'] ?? ''}'.toLowerCase();
      final email = (u['email'] ?? '').toString().toLowerCase();
      return name.contains(q) || email.contains(q);
    }).toList();
  }

  Future<void> _runAction(Future<String?> Function() action, String successMessage) async {
    final messenger = ScaffoldMessenger.of(context);
    final err = await action();
    if (!mounted) return;

    if (err != null) {
      messenger.showSnackBar(SnackBar(content: Text(err)));
      return;
    }

    messenger.showSnackBar(SnackBar(content: Text(successMessage)));
    await _loadUsers();
  }

  Future<void> _confirmDelete(Map<String, dynamic> user) async {
    final fullName = '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'.trim();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete User'),
        content: Text(
          'This will permanently delete $fullName\'s account and cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed != true) return;
    if (!mounted) return;

    Navigator.pop(context); // close the detail sheet
    await _runAction(
      () => UserSession.adminDeleteUser(user['_id'].toString()),
      'User deleted.',
    );
  }

  void _openUserDetail(Map<String, dynamic> user) {
    final isSelf = user['_id']?.toString() == UserSession.current?.id;
    final status = (user['status'] ?? 'active').toString();
    final role = (user['role'] ?? '').toString();
    final fullName = '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'.trim();

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(fullName.isEmpty ? 'Unnamed' : fullName,
                    style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text((user['email'] ?? '').toString(),
                    style: GoogleFonts.inter(color: const Color(0xFF64748B), fontSize: 13)),
                const SizedBox(height: 10),
                Row(
                  children: [
                    RoleBadge(role: role),
                    const SizedBox(width: 8),
                    _statusBadge(status),
                  ],
                ),
                const SizedBox(height: 16),
                if ((user['teacherId'] ?? '').toString().isNotEmpty)
                  _detailLine('Teacher ID', user['teacherId'].toString()),
                if ((user['department'] ?? '').toString().isNotEmpty)
                  _detailLine('Department', user['department'].toString()),
                if ((user['staffType'] ?? '').toString().isNotEmpty)
                  _detailLine('Staff Type', user['staffType'].toString()),
                const SizedBox(height: 20),

                if (status == 'pending')
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(backgroundColor: _blue),
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        _runAction(
                          () => UserSession.adminApproveUser(user['_id'].toString()),
                          'User approved.',
                        );
                      },
                      child: const Text('Approve', style: TextStyle(color: Colors.white)),
                    ),
                  ),

                if (status == 'deactivated')
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(backgroundColor: _blue),
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        _runAction(
                          () => UserSession.adminReactivateUser(user['_id'].toString()),
                          'User reactivated.',
                        );
                      },
                      child: const Text('Reactivate', style: TextStyle(color: Colors.white)),
                    ),
                  ),

                if (status == 'active' && !isSelf) ...[
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        _runAction(
                          () => UserSession.adminUpdateUserRole(
                              user['_id'].toString(), role == 'admin' ? 'staff' : 'admin'),
                          'Role updated.',
                        );
                      },
                      child: Text(role == 'admin' ? 'Change to Staff' : 'Change to Admin'),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.orange.shade800),
                      onPressed: () {
                        Navigator.pop(sheetContext);
                        _runAction(
                          () => UserSession.adminDeactivateUser(user['_id'].toString()),
                          'User deactivated.',
                        );
                      },
                      child: const Text('Deactivate'),
                    ),
                  ),
                ],

                if (!isSelf) ...[
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                      onPressed: () => _confirmDelete(user),
                      child: const Text('Delete Account'),
                    ),
                  ),
                ],

                if (isSelf) ...[
                  const SizedBox(height: 4),
                  Text(
                    'This is your own account — role changes and deletion are not available here.',
                    style: GoogleFonts.inter(fontSize: 12, color: const Color(0xFF5B6674)),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _detailLine(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(label,
                style: GoogleFonts.inter(fontSize: 13, color: const Color(0xFF64748B))),
          ),
          Expanded(
            child: Text(value,
                style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Widget _statusBadge(String status) {
    final Color color;
    switch (status) {
      case 'pending':
        color = const Color(0xFFF59E0B);
        break;
      case 'deactivated':
        color = const Color(0xFFEF4444);
        break;
      default:
        color = const Color(0xFF10B981);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status[0].toUpperCase() + status.substring(1),
        style: GoogleFonts.inter(color: color, fontSize: 12, fontWeight: FontWeight.w600),
      ),
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
        title: Text('User Management',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Column(
          children: [
            TextField(
              onChanged: (v) => setState(() => _search = v),
              decoration: InputDecoration(
                hintText: 'Search by name or email',
                prefixIcon: const Icon(Icons.search, size: 20),
                filled: true,
                fillColor: const Color(0xFFF8FAFC),
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _error != null
                      ? Center(child: Text(_error!))
                      : _filteredUsers.isEmpty
                          ? Center(
                              child: Text('No users found.',
                                  style: GoogleFonts.inter(color: const Color(0xFF64748B))),
                            )
                          : RefreshIndicator(
                              onRefresh: _loadUsers,
                              child: ListView.builder(
                                itemCount: _filteredUsers.length,
                                itemBuilder: (context, index) {
                                  final user = _filteredUsers[index];
                                  final role = (user['role'] ?? '').toString();
                                  final status = (user['status'] ?? 'active').toString();
                                  final fullName =
                                      '${user['firstName'] ?? ''} ${user['lastName'] ?? ''}'.trim();

                                  return ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    leading: CircleAvatar(
                                      backgroundColor: role == 'admin'
                                          ? const Color(0xFFF3E8FF)
                                          : const Color(0xFFEFF5FF),
                                      child: Icon(
                                        role == 'admin'
                                            ? Icons.admin_panel_settings
                                            : Icons.person,
                                        color: role == 'admin'
                                            ? const Color(0xFF7C3AED)
                                            : _blue,
                                      ),
                                    ),
                                    title: Text(fullName.isEmpty ? 'Unnamed' : fullName,
                                        style: GoogleFonts.inter(
                                            fontWeight: FontWeight.w600, fontSize: 14)),
                                    subtitle: Text((user['email'] ?? '').toString(),
                                        style: GoogleFonts.inter(
                                            fontSize: 12, color: const Color(0xFF64748B))),
                                    trailing: _statusBadge(status),
                                    onTap: () => _openUserDetail(user),
                                  );
                                },
                              ),
                            ),
            ),
          ],
        ),
      ),
    );
  }
}
