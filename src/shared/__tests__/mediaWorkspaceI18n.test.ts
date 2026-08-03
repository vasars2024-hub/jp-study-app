import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import {
  ADOPTED_MEDIA_I18N_ALLOWLIST,
  ADOPTED_MEDIA_I18N_SURFACES,
} from '../mediaWorkspaceI18n';

const TECHNICAL_TEXT = /^(MEDIA|CPU|GPU|A|B|x|s|ms)$/;

function untranslatedJsxText(file: string): string[] {
  const absolute = path.resolve(file);
  const source = fs.readFileSync(absolute, 'utf8');
  const tree = ts.createSourceFile(
    absolute,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.getText(tree).replace(/\s+/g, ' ').trim();
      if (/[A-Za-z]/.test(text) && !TECHNICAL_TEXT.test(text)) {
        const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
        findings.push(`${file}:${line}: ${text}`);
      }
    }
    if (
      ts.isJsxAttribute(node)
      && ['aria-label', 'placeholder', 'title'].includes(node.name.getText(tree))
      && node.initializer
      && ts.isStringLiteral(node.initializer)
      && /[A-Za-z]/.test(node.initializer.text)
    ) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      findings.push(`${file}:${line}: ${node.name.getText(tree)}="${node.initializer.text}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return findings;
}

describe('ADR-003 Phase-4 Media workspace gate', () => {
  it('has an empty adopted-surface exemption allowlist', () => {
    expect(ADOPTED_MEDIA_I18N_ALLOWLIST).toEqual([]);
  });

  it('contains no raw user-facing English JSX in host-owned adopted surfaces', () => {
    expect(ADOPTED_MEDIA_I18N_SURFACES.flatMap(untranslatedJsxText)).toEqual([]);
  });

  it('ships every Media workspace key in EN/JA/ZH/RU', () => {
    const keys = Object.keys(en).filter((key) => key.startsWith('mediaWorkspace.'));
    expect(keys.length).toBeGreaterThan(100);
    for (const lang of ['ja', 'zh', 'ru'] as const) {
      expect(
        keys.filter((key) => CATALOGS[lang][key] === undefined),
        `${lang} Media workspace translations`,
      ).toEqual([]);
    }
  });
});
