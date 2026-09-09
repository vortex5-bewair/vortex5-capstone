import 'package:flutter/material.dart';
import 'package:vortex5_application_2/app_state.dart';
import 'package:vortex5_application_2/models/user_session.dart';
import 'package:vortex5_application_2/widgets/error_state.dart';

class ShareDevicePage extends StatefulWidget {
  final AppState appState;
  final String deviceId;
  final String deviceName;

  const ShareDevicePage({
    super.key,
    required this.appState,
    required this.deviceId,
    required this.deviceName,
  });

  @override
  State<ShareDevicePage> createState() => _ShareDevicePageState();
}

class _ShareDevicePageState extends State<ShareDevicePage> {
  static const _blue = Color(0xFF1E5BFF);

  final _searchCtrl = TextEditingController();
  String _search = '';

  List<Map<String, dynamic>> _sharedUsers = []; // already has access
  List<Map<String, dynamic>> _allStaff = []; // every active staff account
  final Set<String> _selected = {}; // emails selected to share with

  bool _loading = true;
  bool _sharing = false;
  bool _hasLoadedOnce = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadAll() async {
    // Only show the full-page spinner on the very first load — a pull-to-
    // refresh or a reload after sharing/unsharing shouldn't blank the whole
    // list (and lose scroll position) while it's already showing good data.
    if (!_hasLoadedOnce) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        widget.appState.getDeviceUsers(widget.deviceId),
        UserSession.fetchAllUsers(),
      ]);
      if (!mounted) return;
      setState(() {
        _sharedUsers = results[0];
        _allStaff = results[1]
            .where((u) =>
                u['role']?.toString() == 'staff' &&
                u['status']?.toString() == 'active')
            .toList();
        _error = null;
        _hasLoadedOnce = true;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      final hadData = _hasLoadedOnce;
      setState(() {
        _loading = false;
        if (!hadData) {
          _error = 'Could not load the staff list. Check your connection and try again.';
        }
      });
      if (hadData) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not refresh. Showing the last loaded list.')),
        );
      }
    }
  }

  List<Map<String, dynamic>> get _availableUsers {
    final sharedEmails =
        _sharedUsers.map((u) => u['email']?.toString().toLowerCase()).toSet();
    var result = _allStaff
        .where((u) => !sharedEmails.contains(u['email']?.toString().toLowerCase()))
        .toList();

    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      result = result.where((u) {
        final name = '${u['firstName'] ?? ''} ${u['lastName'] ?? ''}'.toLowerCase();
        final email = (u['email'] ?? '').toString().toLowerCase();
        return name.contains(q) || email.contains(q);
      }).toList();
    }
    return result;
  }

  void _toggleSelected(String email) {
    setState(() {
      if (_selected.contains(email)) {
        _selected.remove(email);
      } else {
        _selected.add(email);
      }
    });
  }

  Future<void> _shareSelected() async {
    if (_selected.isEmpty) return;
    setState(() => _sharing = true);
    final messenger = ScaffoldMessenger.of(context);

    final emails = _selected.toList();
    final failures = <String>[];
    for (final email in emails) {
      final error = await widget.appState.shareDevice(widget.deviceId, email);
      if (error != null) failures.add(email);
    }

    if (!mounted) return;
    setState(() {
      _sharing = false;
      _selected.clear();
    });

    if (failures.isEmpty) {
      messenger.showSnackBar(
        SnackBar(content: Text('Shared with ${emails.length} ${emails.length == 1 ? 'user' : 'users'}.')),
      );
    } else {
      messenger.showSnackBar(
        SnackBar(content: Text('Shared, but failed for: ${failures.join(', ')}')),
      );
    }
    _loadAll();
  }

  Future<void> _unshare(String email, String name) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Revoke Access'),
        content: Text('Remove $name ($email) from this device?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    final error = await widget.appState.unshareDevice(widget.deviceId, email);
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    if (error != null) {
      messenger.showSnackBar(SnackBar(content: Text(error)));
    } else {
      messenger.showSnackBar(SnackBar(content: Text('Access revoked for $email')));
      _loadAll();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: _blue,
        foregroundColor: Colors.white,
        title: Text('Share ${widget.deviceName}'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? ErrorState(
                  title: 'Could not load',
                  message: _error!,
                  onRetry: _loadAll,
                )
              : RefreshIndicator(
              onRefresh: _loadAll,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _searchField(),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Available to share (${_availableUsers.length})',
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.black54,
                          ),
                        ),
                      ),
                      SizedBox(
                        height: 36,
                        child: ElevatedButton(
                          onPressed: _selected.isEmpty || _sharing ? null : _shareSelected,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: _blue,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor: const Color(0xFFCBD5E1),
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                          ),
                          child: _sharing
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                )
                              : Text(_selected.isEmpty ? 'Share' : 'Share (${_selected.length})'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_availableUsers.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      child: Text(
                        _allStaff.isEmpty
                            ? 'No active staff accounts to share with.'
                            : _search.trim().isEmpty
                                ? 'Everyone already has access.'
                                : 'No matching staff found.',
                        style: const TextStyle(color: Colors.black54),
                      ),
                    )
                  else
                    ..._availableUsers.map((u) {
                      final email = u['email']?.toString() ?? '';
                      final first = u['firstName']?.toString() ?? '';
                      final last = u['lastName']?.toString() ?? '';
                      final fullName = '$first $last'.trim();
                      final isSelected = _selected.contains(email);
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                          side: isSelected
                              ? const BorderSide(color: _blue, width: 1.4)
                              : BorderSide.none,
                        ),
                        child: CheckboxListTile(
                          controlAffinity: ListTileControlAffinity.leading,
                          value: isSelected,
                          onChanged: (_) => _toggleSelected(email),
                          activeColor: _blue,
                          title: Text(fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text(email),
                          secondary: const CircleAvatar(
                            backgroundColor: Color(0xFFF3F4F6),
                            child: Icon(Icons.person, color: Colors.black54),
                          ),
                        ),
                      );
                    }),
                  const SizedBox(height: 20),
                  const Divider(height: 1),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Icon(Icons.people_outline, size: 20, color: Colors.black54),
                      const SizedBox(width: 8),
                      Text(
                        'Already has access (${_sharedUsers.length})',
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: Colors.black54,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_sharedUsers.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text(
                        'No users have access yet.',
                        style: TextStyle(color: Colors.black54),
                      ),
                    )
                  else
                    ..._sharedUsers.map((u) {
                      final email = u['email']?.toString() ?? '';
                      final first = u['firstName']?.toString() ?? '';
                      final last = u['lastName']?.toString() ?? '';
                      final role = u['role']?.toString() ?? '';
                      final fullName = '$first $last'.trim();
                      return Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: role == 'admin'
                                ? const Color(0xFFEFF5FF)
                                : const Color(0xFFF3F4F6),
                            child: Icon(
                              role == 'admin' ? Icons.admin_panel_settings : Icons.person,
                              color: role == 'admin' ? _blue : Colors.black54,
                            ),
                          ),
                          title: Text(fullName, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('$email  •  $role'),
                          trailing: role == 'admin'
                              ? null
                              : MergeSemantics(
                                  child: Semantics(
                                    label: 'Remove access for $fullName',
                                    button: true,
                                    child: IconButton(
                                      tooltip: 'Remove access',
                                      icon: const Icon(
                                          Icons.remove_circle_outline,
                                          color: Colors.red),
                                      onPressed: () => _unshare(email, fullName),
                                    ),
                                  ),
                                ),
                        ),
                      );
                    }),
                ],
              ),
            ),
    );
  }

  Widget _searchField() {
    return TextField(
      controller: _searchCtrl,
      onChanged: (v) => setState(() => _search = v),
      decoration: InputDecoration(
        hintText: 'Search staff by name or email',
        prefixIcon: const Icon(Icons.search),
        suffixIcon: _search.isEmpty
            ? null
            : MergeSemantics(
                child: Semantics(
                  label: 'Clear search',
                  button: true,
                  child: IconButton(
                    tooltip: 'Clear search',
                    icon: const Icon(Icons.clear),
                    onPressed: () {
                      _searchCtrl.clear();
                      setState(() => _search = '');
                    },
                  ),
                ),
              ),
        filled: true,
        fillColor: const Color(0xFFF8FAFC),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFD8E4EA)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFFD8E4EA)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _blue, width: 1.4),
        ),
      ),
    );
  }
}
