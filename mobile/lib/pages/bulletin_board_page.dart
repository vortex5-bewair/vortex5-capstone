import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:vortex5_application_2/app_state.dart';
import 'package:vortex5_application_2/models/bulletin_post.dart';
import 'package:vortex5_application_2/models/user_session.dart';
import 'create_announcement_page.dart';

/// Category → color lookup. Categories are real, meaningful data (not
/// decoration) so each gets a deliberate color, making the feed scannable
/// at a glance. Falls back to slate for any free-text category the backend
/// doesn't constrain to this list.
Color categoryColor(String category) {
  switch (category) {
    case 'Events':
      return const Color(0xFFF59E0B); // amber
    case 'System Updates':
      return const Color(0xFF1E5BFF); // brand blue
    case 'Achievements':
      return const Color(0xFF10B981); // emerald
    case 'Reminders':
      return const Color(0xFFEF4444); // coral/red
    default:
      return const Color(0xFF64748B); // slate
  }
}

class BulletinBoardPage extends StatefulWidget {
  const BulletinBoardPage({super.key, required this.appState});

  final AppState appState;

  @override
  State<BulletinBoardPage> createState() => _BulletinBoardPageState();
}

class _BulletinBoardPageState extends State<BulletinBoardPage> {
  static const _blue = Color(0xFF1E5BFF);
  static const _categories = [
    'All',
    'Events',
    'System Updates',
    'Achievements',
    'Reminders',
  ];

  List<BulletinPost> _posts = [];
  String _selectedCategory = 'All';
  String _search = '';
  bool _loading = true;
  String? _error;

  // Debounce the search box: each keystroke otherwise re-filters every post
  // and rebuilds the whole list.
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadPosts());
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String v) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 250), () {
      if (mounted) setState(() => _search = v);
    });
  }

  Map<String, String> _headers() {
    final token = UserSession.current?.token ?? '';
    return {
      'Content-Type': 'application/json',
      if (token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<void> _loadPosts() async {
    setState(() { _loading = true; _error = null; });
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/announcements');
      final res = await http.get(uri, headers: _headers()).timeout(const Duration(seconds: 30));
      if (res.statusCode != 200) throw Exception('Server error ${res.statusCode}');
      final list = jsonDecode(res.body) as List<dynamic>;
      _posts = list
          .map((e) => BulletinPost.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      _error = e.toString();
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _deletePost(String id) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/announcements/$id');
      final res = await http.delete(uri, headers: _headers()).timeout(const Duration(seconds: 10));

      if (!mounted) return;

      if (res.statusCode == 200) {
        setState(() => _posts.removeWhere((p) => p.id == id));
      } else {
        messenger.showSnackBar(const SnackBar(content: Text('Failed to delete announcement.')));
      }
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(content: Text('Network error deleting announcement.')));
    }
  }

  Future<void> _togglePin(BulletinPost post) async {
    final messenger = ScaffoldMessenger.of(context);
    final nextPinned = !post.pinned;
    try {
      final uri = Uri.parse('${UserSession.baseUrl}/api/announcements/${post.id}');
      final res = await http
          .put(uri, headers: _headers(), body: jsonEncode({'pinned': nextPinned}))
          .timeout(const Duration(seconds: 10));

      if (!mounted) return;

      if (res.statusCode == 200) {
        final updated = BulletinPost.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
        setState(() {
          final index = _posts.indexWhere((p) => p.id == post.id);
          if (index != -1) _posts[index] = updated;
        });
        messenger.showSnackBar(
          SnackBar(content: Text(nextPinned ? 'Announcement pinned.' : 'Announcement unpinned.')),
        );
      } else {
        messenger.showSnackBar(const SnackBar(content: Text('Failed to update pin status.')));
      }
    } catch (_) {
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(content: Text('Network error updating pin status.')));
    }
  }

  Future<void> _openCreatePage() async {
    final created = await Navigator.push<BulletinPost>(
      context,
      MaterialPageRoute(builder: (_) => const CreateAnnouncementPage()),
    );
    if (created == null || !mounted) return;
    setState(() => _posts.insert(0, created));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Announcement saved.')),
    );
  }

  Future<void> _openEditPage(BulletinPost post) async {
    final updated = await Navigator.push<BulletinPost>(
      context,
      MaterialPageRoute(builder: (_) => CreateAnnouncementPage(existing: post)),
    );
    if (updated == null || !mounted) return;
    setState(() {
      final index = _posts.indexWhere((p) => p.id == updated.id);
      if (index != -1) _posts[index] = updated;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Announcement updated.')),
    );
  }

  List<BulletinPost> get _filteredPosts {
    var result = _selectedCategory == 'All'
        ? _posts
        : _posts.where((p) => p.category == _selectedCategory).toList();

    if (_search.trim().isNotEmpty) {
      final q = _search.trim().toLowerCase();
      result = result
          .where((p) =>
              p.title.toLowerCase().contains(q) ||
              p.message.toLowerCase().contains(q))
          .toList();
    }
    return result;
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = widget.appState.isAdmin;
    final filtered = _filteredPosts;
    final pinnedPosts = filtered.where((p) => p.pinned).toList();
    final regularPosts = filtered.where((p) => !p.pinned).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF3F4F6),
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
              'Bulletin',
              style: GoogleFonts.poppins(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontSize: 22,
                letterSpacing: 1.4,
              ),
            ),
          ],
        ),
        actions: [
          if (isAdmin)
            IconButton(
              tooltip: 'New announcement',
              onPressed: _openCreatePage,
              icon: const Icon(Icons.add_comment_outlined, color: Colors.white),
            ),
        ],
      ),
      body: _loading
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text(
                    'Loading announcements…\nServer may take a moment to wake up.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(color: const Color(0xFF5B6674), fontSize: 13),
                  ),
                ],
              ),
            )
          : _error != null
              ? _errorState(_error!)
              : RefreshIndicator(
                  onRefresh: _loadPosts,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(12),
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.center,
                        children: [
                          Expanded(child: _searchField()),
                          const SizedBox(width: 10),
                          _categoryDropdown(),
                        ],
                      ),
                      const SizedBox(height: 14),
                      if (pinnedPosts.isNotEmpty) ...[
                        Text(
                          'Pinned Announcements',
                          style: GoogleFonts.poppins(fontSize: 19, fontWeight: FontWeight.w700),
                        ),
                        const SizedBox(height: 10),
                        ...pinnedPosts.map((p) => _announcementCard(p, isAdmin)),
                        const SizedBox(height: 14),
                      ],
                      Text(
                        'Announcements',
                        style: GoogleFonts.poppins(fontSize: 19, fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 10),
                      if (regularPosts.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 40),
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.campaign_outlined,
                                    size: 48, color: Colors.black26),
                                const SizedBox(height: 12),
                                Text(
                                  'No announcements yet.',
                                  style: GoogleFonts.inter(color: Colors.black45),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ...regularPosts.map((p) => _announcementCard(p, isAdmin)),
                    ],
                  ),
                ),
    );
  }

  Widget _searchField() {
    return TextField(
      onChanged: _onSearchChanged,
      style: GoogleFonts.inter(fontSize: 14),
      decoration: InputDecoration(
        hintText: 'Search announcements',
        hintStyle: GoogleFonts.inter(fontSize: 14, color: const Color(0xFF5B6674)),
        prefixIcon: const Icon(Icons.search, size: 20, color: Color(0xFF475569)),
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: Color(0xFFD1D5DB)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: _blue, width: 1.4),
        ),
      ),
    );
  }

  Widget _categoryDropdown() {
    return Container(
      // A compact filter pill. Its tap target is a little under 48dp; the
      // touch-target hint from the scanner is accepted for now (a full 48
      // makes this control look oversized next to the search field).
      height: 44,
      width: 150,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFD1D5DB)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _selectedCategory,
          isExpanded: true,
          isDense: true,
          icon: const Icon(Icons.keyboard_arrow_down_rounded,
              size: 18, color: Color(0xFF64748B)),
          borderRadius: BorderRadius.circular(14),
          onChanged: (value) {
            if (value != null) setState(() => _selectedCategory = value);
          },
          items: _categories.map((category) {
            final color =
                category == 'All' ? const Color(0xFF334155) : categoryColor(category);
            return DropdownMenuItem(
              value: category,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      category,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                          fontSize: 13, fontWeight: FontWeight.w600, color: const Color(0xFF0F172A)),
                    ),
                  ),
                ],
              ),
            );
          }).toList(),
        ),
      ),
    );
  }

  Widget _announcementCard(BulletinPost post, bool isAdmin) {
    final color = categoryColor(post.category);
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border(
          top: const BorderSide(color: Color(0xFFE2E8F0)),
          right: const BorderSide(color: Color(0xFFE2E8F0)),
          bottom: const BorderSide(color: Color(0xFFE2E8F0)),
          left: BorderSide(color: color, width: 4),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(post.category,
                    style: GoogleFonts.inter(
                        fontSize: 12, fontWeight: FontWeight.w600, color: color)),
              ),
              if (post.pinned && !isAdmin) ...[
                const SizedBox(width: 6),
                Semantics(
                  label: 'Pinned',
                  child: const Icon(Icons.push_pin_rounded,
                      size: 14, color: Color(0xFF1E5BFF)),
                ),
              ],
              const Spacer(),
              if (isAdmin) ...[
                // IconButtons (not bare GestureDetectors) so each has a
                // screen-reader label. The label names the announcement so
                // that identical actions on different cards aren't reported
                // as duplicate speakable text.
                MergeSemantics(
                  child: Semantics(
                    label: post.pinned
                        ? 'Unpin announcement: ${post.title}'
                        : 'Pin announcement: ${post.title}',
                    child: IconButton(
                      tooltip: post.pinned ? 'Unpin' : 'Pin',
                      onPressed: () => _togglePin(post),
                      icon: Icon(
                        post.pinned
                            ? Icons.push_pin_rounded
                            : Icons.push_pin_outlined,
                        size: 22,
                        color: post.pinned ? _blue : const Color(0xFF64748B),
                      ),
                    ),
                  ),
                ),
                MergeSemantics(
                  child: Semantics(
                    label: 'Edit announcement: ${post.title}',
                    child: IconButton(
                      tooltip: 'Edit',
                      onPressed: () => _openEditPage(post),
                      icon: const Icon(Icons.edit_outlined,
                          size: 22, color: Color(0xFF64748B)),
                    ),
                  ),
                ),
                MergeSemantics(
                  child: Semantics(
                    label: 'Delete announcement: ${post.title}',
                    child: IconButton(
                      tooltip: 'Delete',
                      onPressed: () => _confirmDelete(post),
                      icon: const Icon(Icons.delete_outline_rounded,
                          size: 22, color: Color(0xFF64748B)),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          Text(
            post.title,
            style: GoogleFonts.poppins(fontSize: 17, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(post.message,
              style: GoogleFonts.inter(color: const Color(0xFF475569), height: 1.4)),
          const SizedBox(height: 10),
          Text(
            _timeAgo(post.createdAt),
            style: GoogleFonts.inter(
              color: _blue,
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }

  void _confirmDelete(BulletinPost post) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete announcement?'),
        content: Text('"${post.title}" will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _deletePost(post.id);
            },
            child:
                const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
  }

  Widget _errorState(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded,
                size: 48, color: Colors.black26),
            const SizedBox(height: 12),
            Text(
              'Could not load announcements',
              style: GoogleFonts.inter(
                  fontWeight: FontWeight.w700, color: const Color(0xFF0F172A)),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(color: const Color(0xFF5B6674), fontSize: 12),
            ),
            const SizedBox(height: 16),
            TextButton.icon(
              onPressed: _loadPosts,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  String _timeAgo(DateTime value) {
    final diff = DateTime.now().difference(value);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) {
      final m = diff.inMinutes;
      return '$m min ago';
    }
    if (diff.inDays < 1) {
      final h = diff.inHours;
      return '$h hr${h == 1 ? '' : 's'} ago';
    }
    if (diff.inDays < 7) {
      final d = diff.inDays;
      return '$d day${d == 1 ? '' : 's'} ago';
    }
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    return '${months[value.month - 1]} ${value.day}';
  }
}
