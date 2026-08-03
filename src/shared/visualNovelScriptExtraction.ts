import type {
  VisualNovelEngine,
  VisualNovelTextKind,
} from './visualNovel';

export const VISUAL_NOVEL_SCRIPT_LINE_LIMIT = 10_000;

export interface VisualNovelScriptLine {
  id: string;
  fileName: string;
  lineNumber: number;
  kind: VisualNovelTextKind;
  japanese: string;
  speaker: string;
  scene: string;
}

const hasJapanese = (value: string): boolean => /[\u3040-\u30ff\u3400-\u9fff]/u.test(value);
const cleanText = (value: string): string => value
  .replace(/\\n/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function stripScenarioTags(value: string): string {
  return cleanText(value.replace(/\[[^\]]+\]/g, '').replace(/;.*$/, ''));
}

function extractRenpy(
  content: string,
  fileName: string,
): VisualNovelScriptLine[] {
  const characters = new Map<string, string>();
  const output: VisualNovelScriptLine[] = [];
  let scene = '';
  let inMenu = false;
  for (const [index, source] of content.split(/\r?\n/).entries()) {
    const trimmed = source.trim();
    const definition = trimmed.match(/^define\s+([A-Za-z_]\w*)\s*=\s*Character\(\s*["']([^"']+)["']/);
    if (definition) {
      characters.set(definition[1], definition[2]);
      continue;
    }
    const label = trimmed.match(/^label\s+([A-Za-z_]\w*)\s*:/);
    if (label) {
      scene = label[1];
      inMenu = false;
      continue;
    }
    if (/^menu\s*:/.test(trimmed)) {
      inMenu = true;
      continue;
    }
    if (!trimmed || trimmed.startsWith('#') || /^(?:python|init|transform|screen|style)\b/.test(trimmed)) continue;
    const dialogue = trimmed.match(/^(?:([A-Za-z_]\w*)\s+)?["“](.+)["”]\s*:?\s*$/);
    if (!dialogue) continue;
    const japanese = cleanText(dialogue[2]);
    if (!hasJapanese(japanese)) continue;
    output.push({
      id: `${fileName}:${index + 1}`,
      fileName,
      lineNumber: index + 1,
      kind: inMenu && trimmed.endsWith(':') ? 'choice' : dialogue[1] ? 'dialogue' : 'narration',
      japanese,
      speaker: dialogue[1] ? characters.get(dialogue[1]) ?? dialogue[1] : '',
      scene,
    });
    if (!trimmed.endsWith(':')) inMenu = false;
  }
  return output;
}

function extractScenarioScript(
  content: string,
  fileName: string,
): VisualNovelScriptLine[] {
  const output: VisualNovelScriptLine[] = [];
  let speaker = '';
  let scene = '';
  for (const [index, source] of content.split(/\r?\n/).entries()) {
    const trimmed = source.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('//')) continue;
    const label = trimmed.match(/^\*(\S+)/);
    if (label) {
      scene = label[1];
      continue;
    }
    if (trimmed.startsWith('#')) {
      speaker = cleanText(trimmed.slice(1));
      continue;
    }
    const nameTag = trimmed.match(/\[(?:name|chara_name)[^\]]*(?:text|name)=["']([^"']+)["'][^\]]*\]/i);
    if (nameTag) speaker = cleanText(nameTag[1]);
    const choice = trimmed.match(/\[(?:glink|link)[^\]]*text=["']([^"']+)["'][^\]]*\]/i);
    if (choice && hasJapanese(choice[1])) {
      output.push({
        id: `${fileName}:${index + 1}:choice`,
        fileName,
        lineNumber: index + 1,
        kind: 'choice',
        japanese: cleanText(choice[1]),
        speaker: '',
        scene,
      });
    }
    const japanese = stripScenarioTags(trimmed);
    if (!japanese || !hasJapanese(japanese)) continue;
    const bracketDialogue = japanese.match(/^([^「」]{1,24})「(.+)」$/);
    output.push({
      id: `${fileName}:${index + 1}`,
      fileName,
      lineNumber: index + 1,
      kind: bracketDialogue || speaker ? 'dialogue' : 'narration',
      japanese: cleanText(bracketDialogue?.[2] ?? japanese),
      speaker: cleanText(bracketDialogue?.[1] ?? speaker),
      scene,
    });
  }
  return output;
}

function extractGeneric(
  content: string,
  fileName: string,
): VisualNovelScriptLine[] {
  const output: VisualNovelScriptLine[] = [];
  let scene = '';
  for (const [index, source] of content.split(/\r?\n/).entries()) {
    const trimmed = source.trim();
    const label = trimmed.match(/^(?:\*|#\s*scene\s+)(\S+)/i);
    if (label) {
      scene = label[1];
      continue;
    }
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith(';')) continue;
    const bracketDialogue = trimmed.match(/^([^「」]{1,24})「(.+)」$/);
    const colonDialogue = trimmed.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
    const japanese = cleanText(bracketDialogue?.[2] ?? colonDialogue?.[2] ?? trimmed);
    if (!hasJapanese(japanese)) continue;
    output.push({
      id: `${fileName}:${index + 1}`,
      fileName,
      lineNumber: index + 1,
      kind: bracketDialogue || colonDialogue ? 'dialogue' : 'narration',
      japanese,
      speaker: cleanText(bracketDialogue?.[1] ?? colonDialogue?.[1] ?? ''),
      scene,
    });
  }
  return output;
}

export function extractVisualNovelScript(
  content: string,
  fileName: string,
  engine: VisualNovelEngine,
): VisualNovelScriptLine[] {
  const lines = engine === 'renpy' || /\.rpy$/i.test(fileName)
    ? extractRenpy(content, fileName)
    : engine === 'kirikiri' || engine === 'tyrano' || /\.ks$/i.test(fileName)
      ? extractScenarioScript(content, fileName)
      : extractGeneric(content, fileName);
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = `${line.speaker}\u0000${line.japanese}\u0000${line.scene}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, VISUAL_NOVEL_SCRIPT_LINE_LIMIT);
}
