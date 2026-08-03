import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_providers.dart';
import '../auth/domain/auth_provider.dart';
import '../auth/domain/auth_state.dart';

class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  List<Map<String, dynamic>> _documents = [];
  Map<String, dynamic>? _meta;
  String? _error;
  bool _loading = true;
  bool _uploading = false;
  int _page = 1;
  String? _status;

  static const _statuses = ['PENDING', 'PROCESSING', 'INDEXED', 'FAILED'];
  static const _statusLabels = {
    'PENDING': 'Pending',
    'PROCESSING': 'Processing',
    'INDEXED': 'Indexed',
    'FAILED': 'Failed',
  };

  static const _extToMime = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'md': 'text/markdown',
    'txt': 'text/plain',
    'html': 'text/html',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'tiff': 'image/tiff',
  };

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
      final result = await ref.read(documentsServiceProvider).listDocuments(
            page: _page,
            limit: 20,
            status: _status,
          );
      if (!mounted) return;
      setState(() {
        _documents = (result['data'] as List? ?? [])
            .map((d) => (d as Map).cast<String, dynamic>())
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

  Future<void> _pickAndUpload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: _extToMime.keys.toList(),
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final file = result.files.single;
    final bytes = file.bytes;
    if (bytes == null) return;

    final ext = file.extension?.toLowerCase() ?? '';
    final mime = _extToMime[ext] ?? 'application/octet-stream';

    setState(() => _uploading = true);
    try {
      await ref.read(documentsServiceProvider).uploadDocument(
            fileName: file.name,
            bytes: bytes,
            mimeType: mime,
          );
      if (!mounted) return;
      setState(() {
        _uploading = false;
        _page = 1;
      });
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Uploaded "${file.name}" — processing started')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _uploading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Upload failed: $e')),
      );
    }
  }

  Color _statusColor(BuildContext context, String status) {
    switch (status) {
      case 'INDEXED':
        return Colors.green;
      case 'PROCESSING':
        return Colors.blue;
      case 'FAILED':
        return Theme.of(context).colorScheme.error;
      default:
        return Colors.amber.shade800;
    }
  }

  IconData _fileIcon(String fileType) {
    switch (fileType.toLowerCase()) {
      case 'pdf':
        return Icons.picture_as_pdf_outlined;
      case 'docx':
      case 'doc':
        return Icons.description_outlined;
      case 'pptx':
        return Icons.slideshow_outlined;
      case 'xlsx':
        return Icons.table_chart_outlined;
      case 'md':
      case 'txt':
        return Icons.article_outlined;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'tiff':
        return Icons.image_outlined;
      default:
        return Icons.insert_drive_file_outlined;
    }
  }

  String _formatSize(int? bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  String _formatDate(String? iso) {
    if (iso == null || iso.isEmpty) return '';
    final dt = DateTime.tryParse(iso);
    if (dt == null) return '';
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }

  void _openDetail(Map<String, dynamic> doc) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _DocumentDetailSheet(
        document: doc,
        isAdmin: ref.read(authProvider) is Authenticated &&
            (ref.read(authProvider) as Authenticated).role == 'ADMIN',
        onChanged: _load,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Documents'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      floatingActionButton: _uploading
          ? const Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(),
            )
          : FloatingActionButton.extended(
              onPressed: _pickAndUpload,
              icon: const Icon(Icons.upload_file),
              label: const Text('Upload'),
            ),
      body: Column(
        children: [
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: const Text('All'),
                    selected: _status == null,
                    onSelected: (_) {
                      _status = null;
                      _page = 1;
                      _load();
                    },
                  ),
                ),
                ..._statuses.map(
                  (s) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(_statusLabels[s] ?? s),
                      selected: _status == s,
                      onSelected: (_) {
                        _status = s;
                        _page = 1;
                        _load();
                      },
                    ),
                  ),
                ),
              ],
            ),
          ),
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
                : _documents.isEmpty
                    ? const Center(child: Text('No documents yet — upload your first file'))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                          itemCount: _documents.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, index) {
                            final doc = _documents[index];
                            final status = doc['status']?.toString() ?? 'PENDING';
                            final author = doc['author'] as Map? ?? const {};
                            final authorName = [
                              author['firstName'],
                              author['lastName'],
                            ].whereType<String>().where((v) => v.isNotEmpty).join(' ');

                            return Card(
                              margin: EdgeInsets.zero,
                              child: ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: theme.colorScheme.primaryContainer,
                                  child: Icon(_fileIcon(doc['fileType']?.toString() ?? ''), size: 20),
                                ),
                                title: Text(doc['title']?.toString() ?? 'Untitled', maxLines: 1, overflow: TextOverflow.ellipsis),
                                subtitle: Text(
                                  [
                                    authorName.isNotEmpty ? authorName : '—',
                                    _formatSize((doc['fileSize'] as num?)?.toInt()),
                                    _formatDate(doc['createdAt']?.toString()),
                                  ].where((v) => v.isNotEmpty).join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: _statusColor(context, status).withValues(alpha: 0.12),
                                        borderRadius: BorderRadius.circular(12),
                                      ),
                                      child: Text(
                                        _statusLabels[status] ?? status,
                                        style: theme.textTheme.labelSmall?.copyWith(
                                          color: _statusColor(context, status),
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                    const Icon(Icons.chevron_right),
                                  ],
                                ),
                                onTap: () => _openDetail(doc),
                              ),
                            );
                          },
                        ),
                      ),
          ),
          if (_meta != null && (int.parse(_meta!['total'].toString()) > 0))
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
                    'Page ${_meta!['page']} of ${_meta!['totalPages']} · ${_meta!['total']} documents',
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

class _DocumentDetailSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> document;
  final bool isAdmin;
  final VoidCallback onChanged;

  const _DocumentDetailSheet({
    required this.document,
    required this.isAdmin,
    required this.onChanged,
  });

  @override
  ConsumerState<_DocumentDetailSheet> createState() => _DocumentDetailSheetState();
}

class _DocumentDetailSheetState extends ConsumerState<_DocumentDetailSheet> {
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
      final detail = await ref.read(documentsServiceProvider).getDocument(widget.document['id'] as String);
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

  Future<void> _process() async {
    setState(() => _busy = true);
    try {
      await ref.read(documentsServiceProvider).processDocument(widget.document['id'] as String);
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onChanged();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Processing started')),
      );
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed to start processing: $e')),
      );
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete document?'),
        content: Text('"${widget.document['title']}" will be removed from the organization.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(documentsServiceProvider).deleteDocument(widget.document['id'] as String);
      if (!mounted) return;
      setState(() => _busy = false);
      widget.onChanged();
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Document deleted')),
      );
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
    final doc = widget.document;
    final status = _detail?['status']?.toString() ?? doc['status']?.toString() ?? 'PENDING';
    final chunks = _detail?['chunks'] as List? ?? [];
    final author = (_detail?['author'] ?? doc['author']) as Map? ?? const {};

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) => ListView(
        controller: scrollController,
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        children: [
          Text(doc['title']?.toString() ?? 'Untitled', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            [
              author['firstName'],
              author['lastName'],
              doc['fileType']?.toString().toUpperCase(),
            ].whereType<String>().where((v) => v.isNotEmpty).join(' · '),
            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(status, style: theme.textTheme.labelMedium?.copyWith(fontWeight: FontWeight.w600)),
              ),
              const Spacer(),
              if (widget.isAdmin && status != 'INDEXED' && status != 'PROCESSING')
                OutlinedButton.icon(
                  onPressed: _busy ? null : _process,
                  icon: const Icon(Icons.play_arrow, size: 18),
                  label: const Text('Process'),
                ),
              if (widget.isAdmin) ...[
                const SizedBox(width: 8),
                IconButton(
                  tooltip: 'Delete',
                  onPressed: _busy ? null : _delete,
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          if (_loading)
            const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
          else if (_error != null)
            Center(child: Text(_error!, style: TextStyle(color: theme.colorScheme.error)))
          else ...[
            if (_detail?['description']?.toString().isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(_detail!['description'].toString()),
              ),
            Text('Chunks (${chunks.length})', style: theme.textTheme.titleSmall),
            const SizedBox(height: 8),
            if (chunks.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text(
                  'No chunks yet${status == 'INDEXED' ? '' : ' — processing will split this document into searchable chunks'}',
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
              )
            else
              ...chunks.map(
                (c) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Chunk ${c['index']} · ${c['tokenCount'] ?? '?'} tokens',
                          style: theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          c['content']?.toString() ?? '',
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}
