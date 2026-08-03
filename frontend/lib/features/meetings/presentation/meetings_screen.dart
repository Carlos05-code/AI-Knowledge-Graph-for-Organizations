import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_providers.dart';

class MeetingsScreen extends ConsumerStatefulWidget {
  const MeetingsScreen({super.key});

  @override
  ConsumerState<MeetingsScreen> createState() => _MeetingsScreenState();
}

class _MeetingsScreenState extends ConsumerState<MeetingsScreen> {
  List<Map<String, dynamic>> _meetings = [];
  Map<String, dynamic>? _meta;
  String? _error;
  bool _loading = true;
  int _page = 1;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await ref.read(meetingsServiceProvider).listMeetings(page: _page);
      if (!mounted) return;
      setState(() {
        _meetings = (result['data'] as List? ?? [])
            .map((m) => (m as Map).cast<String, dynamic>())
            .toList();
        _meta = result['meta'] as Map<String, dynamic>?;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _openCreate() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _CreateMeetingSheet(onCreated: _load),
    );
  }

  void _openDetail(Map<String, dynamic> meeting) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _MeetingDetailSheet(
        meeting: meeting,
        onChanged: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Meetings'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openCreate,
        icon: const Icon(Icons.event),
        label: const Text('Add Meeting'),
      ),
      body: Column(
        children: [
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _meetings.isEmpty
                    ? const Center(child: Text('No meetings yet — add your first meeting'))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                          itemCount: _meetings.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final meeting = _meetings[index];
                            final participants =
                                meeting['participants'] as List? ?? const [];
                            return Card(
                              margin: EdgeInsets.zero,
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: theme.colorScheme.primaryContainer,
                                  child: const Icon(Icons.meeting_room_outlined, size: 20),
                                ),
                                title: Text(
                                  meeting['title']?.toString() ?? 'Untitled meeting',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                subtitle: Text(
                                  [
                                    _meetingDate(meeting['meetingDate']?.toString()),
                                    participants.isNotEmpty
                                        ? '${participants.length} participant(s)'
                                        : '',
                                    meeting['summary']?.toString().isNotEmpty == true
                                        ? 'Summarized'
                                        : '',
                                  ].where((v) => v.isNotEmpty).join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: const Icon(Icons.chevron_right),
                                onTap: () => _openDetail(meeting),
                              ),
                            );
                          },
                        ),
                      ),
          ),
          if (_meta != null &&
              (int.parse(_meta!['total'].toString()) > 0))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    tooltip: 'Previous page',
                    onPressed: _page > 1
                        ? () {
                            _page--;
                            _load();
                          }
                        : null,
                    icon: const Icon(Icons.chevron_left),
                  ),
                  Text(
                    'Page ${_meta!['page']} of ${_meta!['totalPages']}',
                    style: theme.textTheme.bodySmall,
                  ),
                  IconButton(
                    tooltip: 'Next page',
                    onPressed: _meta!['hasNext'] == true
                        ? () {
                            _page++;
                            _load();
                          }
                        : null,
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

String _meetingDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final dt = DateTime.tryParse(iso);
  if (dt == null) return '';
  return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
}

class _CreateMeetingSheet extends ConsumerStatefulWidget {
  final VoidCallback onCreated;

  const _CreateMeetingSheet({required this.onCreated});

  @override
  ConsumerState<_CreateMeetingSheet> createState() => _CreateMeetingSheetState();
}

class _CreateMeetingSheetState extends ConsumerState<_CreateMeetingSheet> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _transcriptController = TextEditingController();
  final _durationController = TextEditingController();
  DateTime _meetingDate = DateTime.now().add(const Duration(days: 1));
  bool _saving = false;

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    _transcriptController.dispose();
    _durationController.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _meetingDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null && mounted) {
      setState(() => _meetingDate = picked);
    }
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final duration = _durationController.text.trim();
      await ref.read(meetingsServiceProvider).createMeeting(
            title: _titleController.text.trim(),
            description: _descriptionController.text.trim(),
            meetingDate: _meetingDate,
            duration: duration.isNotEmpty ? int.tryParse(duration) : null,
            transcript: _transcriptController.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onCreated();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Meeting created')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Create failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Add Meeting',
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(labelText: 'Title'),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Title is required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _descriptionController,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _pickDate,
                icon: const Icon(Icons.calendar_today_outlined, size: 18),
                label: Text('Meeting date: $_meetingDate'),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _durationController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Duration (minutes, optional)',
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _transcriptController,
                maxLines: 6,
                decoration: const InputDecoration(
                  labelText: 'Transcript (optional)',
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.check),
                label: const Text('Create Meeting'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MeetingDetailSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> meeting;
  final VoidCallback onChanged;

  const _MeetingDetailSheet({
    required this.meeting,
    required this.onChanged,
  });

  @override
  ConsumerState<_MeetingDetailSheet> createState() => _MeetingDetailSheetState();
}

class _MeetingDetailSheetState extends ConsumerState<_MeetingDetailSheet> {
  Map<String, dynamic>? _detail;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final detail = await ref
          .read(meetingsServiceProvider)
          .getMeeting(widget.meeting['id'] as String);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _summarize() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(meetingsServiceProvider)
          .summarizeMeeting(widget.meeting['id'] as String);
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onChanged();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Summary generated')),
      );
      _load();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Summarize failed: $e')),
      );
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete meeting?'),
        content: Text('"${widget.meeting['title']}" will be removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(meetingsServiceProvider)
          .deleteMeeting(widget.meeting['id'] as String);
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onChanged();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Delete failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meeting =
        (_detail ?? widget.meeting).cast<String, dynamic>();
    final participants = meeting['participants'] as List? ?? const [];
    final actionItems = meeting['actionItems'];
    final decisions = meeting['decisions'];

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 48),
        children: [
          Text(
            meeting['title']?.toString() ?? 'Untitled meeting',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 4),
          Text(
            meeting['description']?.toString() ?? '',
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          Text(
            [
              _meetingDate(meeting['meetingDate']?.toString()),
              meeting['duration'] != null ? '${meeting['duration']} min' : '',
            ].where((v) => v.isNotEmpty).join(' · '),
            style: theme.textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              OutlinedButton.icon(
                onPressed: _busy ? null : _summarize,
                icon: const Icon(Icons.auto_awesome, size: 18),
                label: const Text('Generate AI summary'),
              ),
              const Spacer(),
              IconButton(
                tooltip: 'Delete',
                onPressed: _busy ? null : _delete,
                icon: const Icon(Icons.delete_outline),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_error != null)
            Center(child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)))
          else ...[
            if (participants.isNotEmpty) ...[
              Text('Participants', style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: participants.map((p) {
                  final user = (p as Map)['user'] as Map? ?? const {};
                  final joined = [
                    user['firstName'],
                    user['lastName'],
                  ].whereType<String>().where((v) => v.isNotEmpty).join(' ');
                  final name = joined.isNotEmpty ? joined : '—';
                  return Chip(
                    label: Text(name, style: theme.textTheme.labelSmall),
                    visualDensity: VisualDensity.compact,
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
            ],
            if (meeting['summary']?.toString().isNotEmpty == true) ...[
              Text('Summary', style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(meeting['summary'].toString()),
              const SizedBox(height: 16),
            ],
            if (actionItems != null &&
                actionItems is List &&
                actionItems.isNotEmpty) ...[
              Text('Action items', style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(actionItems.map((a) => '• $a').join('\n')),
              const SizedBox(height: 16),
            ],
            if (decisions != null && decisions is List && decisions.isNotEmpty) ...[
              Text('Decisions', style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(decisions.map((d) => '• $d').join('\n')),
              const SizedBox(height: 16),
            ],
            if (meeting['transcript']?.toString().isNotEmpty == true) ...[
              Text('Transcript', style: theme.textTheme.titleSmall),
              const SizedBox(height: 4),
              Text(meeting['transcript'].toString()),
            ],
          ],
        ],
      ),
    );
  }
}