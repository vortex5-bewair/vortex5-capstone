import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import '../models/bulletin_post.dart';
import '../models/user_session.dart';

/// Create AND edit share this page — an edit just pre-fills the fields from
/// [existing] and PUTs instead of POSTing. The form itself is identical
/// either way, so a second page would just be duplicated UI.
class CreateAnnouncementPage extends StatefulWidget {
  const CreateAnnouncementPage({super.key, this.existing});

  /// When set, the page edits this post instead of creating a new one.
  final BulletinPost? existing;

  @override
  State<CreateAnnouncementPage> createState() => _CreateAnnouncementPageState();
}

class _CreateAnnouncementPageState extends State<CreateAnnouncementPage> {
  static const _knownCategories = [
    'Events',
    'System Updates',
    'Achievements',
    'Reminders',
  ];

  final _titleCtrl = TextEditingController();
  final _messageCtrl = TextEditingController();
  late String _category;
  late bool _pinned;
  bool _posting = false;

  bool get _isEditing => widget.existing != null;

  // The backend has no enum on category — it's free text. If an existing
  // post's category isn't one of the known options (e.g. set some other way),
  // include it anyway so the dropdown has a valid current value instead of
  // crashing (DropdownButtonFormField requires its value to be among items).
  late final List<String> _categoryOptions = [
    ..._knownCategories,
    if (widget.existing != null &&
        !_knownCategories.contains(widget.existing!.category))
      widget.existing!.category,
  ];

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    if (existing != null) {
      _titleCtrl.text = existing.title;
      _messageCtrl.text = existing.message;
      _category = existing.category;
      _pinned = existing.pinned;
    } else {
      _category = 'Events';
      _pinned = false;
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _messageCtrl.dispose();
    super.dispose();
  }

  Map<String, String> _headers() {
    final token = UserSession.current?.token ?? '';
    return {
      'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<void> _submit() async {
    final messenger = ScaffoldMessenger.of(context);

    if (_titleCtrl.text.trim().isEmpty || _messageCtrl.text.trim().isEmpty) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Title and message are required.')),
      );
      return;
    }

    setState(() => _posting = true);

    try {
      final body = <String, dynamic>{
        'title': _titleCtrl.text.trim(),
        'description': _messageCtrl.text.trim(),
        'category': _category,
        'pinned': _pinned,
      };

      final http.Response res;
      if (_isEditing) {
        final uri = Uri.parse('${UserSession.baseUrl}/api/announcements/${widget.existing!.id}');
        res = await http
            .put(uri, headers: _headers(), body: jsonEncode(body))
            .timeout(const Duration(seconds: 30));
      } else {
        final now = DateTime.now();
        body['date'] =
            '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
        body['time'] = '${now.hour}:${now.minute.toString().padLeft(2, '0')}';
        final uri = Uri.parse('${UserSession.baseUrl}/api/announcements');
        res = await http
            .post(uri, headers: _headers(), body: jsonEncode(body))
            .timeout(const Duration(seconds: 30));
      }

      if (!mounted) return;
      setState(() => _posting = false);

      if (res.statusCode == 200) {
        final saved = BulletinPost.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
        Navigator.pop(context, saved);
      } else {
        String message = _isEditing ? 'Failed to save changes.' : 'Failed to post announcement.';
        try {
          final data = jsonDecode(res.body) as Map<String, dynamic>;
          message = data['error']?.toString() ?? message;
        } catch (_) {}
        messenger.showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _posting = false);
      messenger.showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        foregroundColor: const Color(0xFF0F172A),
        title: Text(_isEditing ? 'Edit Announcement' : 'New Announcement',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800, fontSize: 20)),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        children: [
          _label('Title'),
          TextField(
            controller: _titleCtrl,
            decoration: _fieldDeco(hint: 'Enter a title'),
          ),
          const SizedBox(height: 16),
          _label('Message'),
          TextField(
            controller: _messageCtrl,
            maxLines: 5,
            decoration: _fieldDeco(hint: 'Write your announcement'),
          ),
          const SizedBox(height: 16),
          _label('Category'),
          DropdownButtonFormField<String>(
            initialValue: _category,
            decoration: _fieldDeco(),
            items: _categoryOptions
                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                .toList(),
            onChanged: (value) => setState(() => _category = value ?? 'Events'),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0xFFD8E4EA)),
            ),
            child: SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text('Pin this announcement',
                  style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14)),
              value: _pinned,
              activeTrackColor: const Color(0xFF1E88FF),
              onChanged: (value) => setState(() => _pinned = value),
            ),
          ),
          const SizedBox(height: 28),
          SizedBox(
            height: 54,
            child: ElevatedButton(
              onPressed: _posting ? null : _submit,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF1E88FF),
                foregroundColor: Colors.white,
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              child: _posting
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text(_isEditing ? 'Save Changes' : 'Post Announcement',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
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
