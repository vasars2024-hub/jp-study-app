import {
  AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT,
  AGENT_EXECUTION_ATTACHMENT_LIMIT,
  AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT,
  type AgentExecutionAttachment,
} from '../shared/agentExecutionBridge';

export const AGENT_ATTACHMENT_ACCEPT = [
  'text/*',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/typescript',
  '.md',
  '.markdown',
  '.jsonl',
  '.csv',
  '.tsv',
  '.srt',
  '.vtt',
  '.ass',
  '.ssa',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.log',
  '.jsx',
  '.tsx',
  '.py',
  '.rb',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.kts',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.sh',
  '.ps1',
  '.sql',
].join(',');

export type AgentAttachmentReadFailureCode =
  | 'too-many'
  | 'unsupported'
  | 'empty'
  | 'too-large'
  | 'total-too-large'
  | 'read-failed';

export type AgentAttachmentReadResult =
  | { ok: true; attachments: AgentExecutionAttachment[] }
  | { ok: false; code: AgentAttachmentReadFailureCode; fileName?: string };

const SUPPORTED_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'srt', 'vtt', 'ass', 'ssa',
  'xml', 'yaml', 'yml', 'toml', 'ini', 'log', 'js', 'jsx', 'ts', 'tsx', 'css', 'html',
  'htm', 'py', 'rb', 'rs', 'go', 'java', 'kt', 'kts', 'c', 'h', 'cpp', 'hpp', 'cs',
  'sh', 'ps1', 'sql',
]);
const DOCUMENT_EXTENSIONS = new Set([
  'md', 'markdown', 'json', 'jsonl', 'csv', 'tsv', 'srt', 'vtt', 'ass', 'ssa',
  'xml', 'yaml', 'yml', 'toml', 'ini',
]);
const SUPPORTED_APPLICATION_MIME = new Set([
  'application/json',
  'application/ld+json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/sql',
]);
// A 100k-character UTF-8 text file can use four bytes per character. Refusing
// anything larger before File.text() keeps a renamed multi-megabyte binary from
// causing renderer jank without rejecting a valid boundary-sized text file.
const MAX_FILE_BYTES_BEFORE_READ = AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT * 4;

function extension(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

function supported(file: File): boolean {
  const mime = file.type.toLowerCase();
  return mime.startsWith('text/')
    || SUPPORTED_APPLICATION_MIME.has(mime)
    || SUPPORTED_EXTENSIONS.has(extension(file.name));
}

function attachmentId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `attachment-${uuid}`;
  return `attachment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function kindFor(file: File): AgentExecutionAttachment['kind'] {
  return DOCUMENT_EXTENSIONS.has(extension(file.name)) ? 'document' : 'text';
}

export async function readAgentAttachmentFiles(
  files: readonly File[],
  current: readonly AgentExecutionAttachment[] = [],
): Promise<AgentAttachmentReadResult> {
  if (current.length + files.length > AGENT_EXECUTION_ATTACHMENT_LIMIT) {
    return { ok: false, code: 'too-many' };
  }
  for (const file of files) {
    if (!supported(file)) return { ok: false, code: 'unsupported', fileName: file.name };
    if (file.size > MAX_FILE_BYTES_BEFORE_READ) {
      return { ok: false, code: 'too-large', fileName: file.name };
    }
  }

  let contents: string[];
  try {
    contents = await Promise.all(files.map((file) => file.text()));
  } catch {
    return { ok: false, code: 'read-failed' };
  }

  const additions: AgentExecutionAttachment[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const contentText = contents[index];
    if (!contentText.trim()) return { ok: false, code: 'empty', fileName: file.name };
    if (contentText.includes('\0')) {
      return { ok: false, code: 'unsupported', fileName: file.name };
    }
    if (contentText.length > AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT) {
      return { ok: false, code: 'too-large', fileName: file.name };
    }
    additions.push({
      id: attachmentId(),
      kind: kindFor(file),
      name: file.name.slice(0, 500),
      ...(file.type ? { mimeType: file.type.slice(0, 200) } : {}),
      sizeBytes: file.size,
      sensitivity: 'sensitive',
      retained: false,
      contentText,
    });
  }

  const attachments = [...current, ...additions];
  const totalChars = attachments.reduce((sum, attachment) => (
    sum + attachment.contentText.length
  ), 0);
  if (totalChars > AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT) {
    return { ok: false, code: 'total-too-large' };
  }
  return { ok: true, attachments };
}
