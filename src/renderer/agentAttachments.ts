import {
  AGENT_EXECUTION_ATTACHMENT_CHAR_LIMIT,
  AGENT_EXECUTION_ATTACHMENT_LIMIT,
  AGENT_EXECUTION_ATTACHMENTS_TOTAL_CHAR_LIMIT,
  AGENT_EXECUTION_IMAGE_BYTES_LIMIT,
  AGENT_EXECUTION_IMAGE_LIMIT,
  AGENT_EXECUTION_IMAGE_MIME_TYPES,
  decodedBase64Bytes,
  type AgentExecutionAttachment,
} from '../shared/agentExecutionBridge';

export const AGENT_ATTACHMENT_ACCEPT = [
  ...AGENT_EXECUTION_IMAGE_MIME_TYPES,
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
  | 'too-many-images'
  | 'unsupported'
  | 'empty'
  | 'too-large'
  | 'image-too-large'
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

const IMAGE_EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  // `.jpg` has no MIME of its own — `image/jpeg` is the registered type for both
  // spellings, and a file picker on Windows routinely reports an empty `type`.
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * The declared format of an image file, or `null` if it is not one of the three
 * the vision lane accepts.
 *
 * The extension is consulted when `File.type` is empty or a variant spelling
 * (`image/jpg` is common and not a registered type). The shared normalizer
 * accepts only the three canonical strings, so resolving it here is what keeps a
 * perfectly valid JPEG from being rejected in main for a name it never chose.
 */
function imageMimeType(file: File): string | null {
  const declared = file.type.toLowerCase();
  if ((AGENT_EXECUTION_IMAGE_MIME_TYPES as readonly string[]).includes(declared)) return declared;
  return IMAGE_EXTENSION_MIME[extension(file.name)] ?? null;
}

function isImageCandidate(file: File): boolean {
  return file.type.toLowerCase().startsWith('image/')
    || extension(file.name) in IMAGE_EXTENSION_MIME;
}

/**
 * Reads a file as raw base64, without the `data:` prefix the contract forbids.
 *
 * `FileReader` rather than `btoa(String.fromCharCode(...bytes))`: the spread form
 * passes one argument per byte and throws `RangeError` on a multi-megabyte
 * screenshot — exactly the size this lane exists for — while the browser's own
 * decoder handles it off the main thread.
 */
function readImageBase64(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      const base64 = comma < 0 ? '' : result.slice(comma + 1);
      resolve(base64 || null);
    };
    reader.readAsDataURL(file);
  });
}

export async function readAgentAttachmentFiles(
  files: readonly File[],
  current: readonly AgentExecutionAttachment[] = [],
): Promise<AgentAttachmentReadResult> {
  if (current.length + files.length > AGENT_EXECUTION_ATTACHMENT_LIMIT) {
    return { ok: false, code: 'too-many' };
  }
  // An image is checked as an image even when its format is one this lane does
  // not take, so a `.gif` is refused as an unsupported image rather than read as
  // text and refused for holding a NUL byte.
  const imageFiles = files.filter(isImageCandidate);
  const currentImages = current.filter((attachment) => attachment.kind === 'image').length;
  if (currentImages + imageFiles.length > AGENT_EXECUTION_IMAGE_LIMIT) {
    return { ok: false, code: 'too-many-images' };
  }
  for (const file of imageFiles) {
    if (!imageMimeType(file)) return { ok: false, code: 'unsupported', fileName: file.name };
    if (file.size > AGENT_EXECUTION_IMAGE_BYTES_LIMIT) {
      return { ok: false, code: 'image-too-large', fileName: file.name };
    }
    if (file.size === 0) return { ok: false, code: 'empty', fileName: file.name };
  }
  const textFiles = files.filter((file) => !isImageCandidate(file));
  for (const file of textFiles) {
    if (!supported(file)) return { ok: false, code: 'unsupported', fileName: file.name };
    if (file.size > MAX_FILE_BYTES_BEFORE_READ) {
      return { ok: false, code: 'too-large', fileName: file.name };
    }
  }

  let contents: Array<string | null>;
  try {
    contents = await Promise.all(files.map((file) => (
      isImageCandidate(file) ? readImageBase64(file) : file.text()
    )));
  } catch {
    return { ok: false, code: 'read-failed' };
  }

  const additions: AgentExecutionAttachment[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const content = contents[index];
    if (content === null) return { ok: false, code: 'read-failed', fileName: file.name };
    if (isImageCandidate(file)) {
      // The DECODED length, measured by the same function main's normalizer
      // uses. `file.size` is the same number for a file read whole, but deriving
      // both sides from one implementation is what stops the size shown in the
      // composer from ever being a different number than the one that ships —
      // main rejects an image whose `sizeBytes` disagrees with its payload.
      const sizeBytes = decodedBase64Bytes(content);
      if (sizeBytes === null) return { ok: false, code: 'read-failed', fileName: file.name };
      additions.push({
        id: attachmentId(),
        kind: 'image',
        name: file.name.slice(0, 500),
        // Non-null: every image file was checked above and the loop returns on
        // the first that has no accepted format.
        mimeType: imageMimeType(file) as string,
        sizeBytes,
        sensitivity: 'sensitive',
        retained: false,
        // No OCR text on a hand-picked file. A capture that already ran OCR
        // supplies it; the picker has nothing to supply.
        contentText: '',
        imageBase64: content,
      });
      continue;
    }
    const contentText = content;
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
