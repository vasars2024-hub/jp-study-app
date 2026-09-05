import { useMemo, useState } from 'react';
import { hasFieldTemplates, renderFieldTemplate, type MiningValues } from '../../shared/anki';
import { DEFAULT_CARD_CSS, renderCardPreview } from '../../shared/kinomotoCard';
import {
  buildPreviewSampleValues,
  fieldHtmlForCardPreview,
  fillBlueprintFieldGaps,
  mergeEffectiveFallbackTemplates,
  mergeEffectiveTemplates,
} from '../../shared/profileFields';
import type { StudyProfile } from '../../shared/profiles';
import { ContextualSurface } from './liquid/LiquidSurface';
import { useT } from '../i18n';

export type MappingPreviewState = {
  templates: Record<string, string>;
  fallbackTemplates: Record<string, string>;
  exampleFallback: boolean;
};

function PreviewFrame({ html, css, title }: { html: string; css: string; title: string }) {
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html, body {
      margin: 0;
      padding: 0;
      background: #1b1b21;
      color: #f5f5f5;
      min-height: 100%;
    }
    * {
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
    }
    ${css}
  </style></head><body><div class="card">${html}</div></body></html>`;

  return (
    <iframe
      className="card-preview-iframe"
      title={title}
      srcDoc={doc}
      tabIndex={-1}
    />
  );
}

export default function AnkiCardPreview({
  profile,
  fields,
  mapping,
  noteCss,
}: {
  profile: StudyProfile;
  fields: string[];
  mapping: MappingPreviewState;
  noteCss?: string;
}) {
  const { t, lang } = useT();
  const [showFallback, setShowFallback] = useState(false);

  const css = noteCss ?? profile.noteCss ?? DEFAULT_CARD_CSS;

  const activeTemplates = useMemo(() => {
    const { templates, fallbackTemplates, exampleFallback } = mapping;
    const effective = mergeEffectiveTemplates(profile, fields, templates);
    if (!hasFieldTemplates(effective)) return null;
    if (showFallback && exampleFallback && hasFieldTemplates(fallbackTemplates)) {
      return mergeEffectiveFallbackTemplates(profile, fields, fallbackTemplates);
    }
    return effective;
  }, [mapping, profile, fields, showFallback]);

  const sampleValues = useMemo(
    () => buildPreviewSampleValues(profile, activeTemplates ?? mapping.templates) as MiningValues,
    [activeTemplates, profile, mapping.templates],
  );

  const preview = useMemo(() => {
    if (!activeTemplates || fields.length === 0) return null;

    const rendered = fieldHtmlForCardPreview(fields, activeTemplates, (tpl) =>
      renderFieldTemplate(tpl, sampleValues),
    );
    if (Object.values(rendered).every((v) => !v?.trim())) return null;

    const fieldHtml = fillBlueprintFieldGaps(profile, rendered);
    return renderCardPreview(profile, fieldHtml, css);
  }, [activeTemplates, css, fields, profile, sampleValues]);

  // `lang`, never `t` — `t`'s identity is stable by design, so a `t` dependency goes
  // silently stale after a language switch instead of erroring (CLAUDE.md i18n rule 6).
  // No eslint-disable: `react-hooks/exhaustive-deps` is not a configured rule here, so
  // the directive would itself be reported as an error.
  const profileHint = useMemo(
    () =>
      t('anki.cardPreview.profileHint', {
        label: profile.label,
        front: profile.card.frontLang.toUpperCase(),
        back: profile.card.backLang.toUpperCase(),
      }),
    [profile, lang],
  );

  // L7: a preview is exactly what the plan lists as a Liquid region — context beside the work,
  // never the work itself. `ContextualSurface` is inert outside a window in Liquid presentation,
  // so the conventional and Blanc pixels are unchanged and reversibility costs nothing. The
  // mapping editor and the manual-card form beside it stay on their opaque anchors.
  if (!preview) {
    return (
      <ContextualSurface as="aside" className="card-preview card-preview-empty">
        <p className="card-preview-label">{t('anki.cardPreview.label')}</p>
        <p className="muted">{t('anki.cardPreview.emptyHint')}</p>
      </ContextualSurface>
    );
  }

  return (
    <ContextualSurface as="aside" className="card-preview">
      <div className="card-preview-head">
        <div>
          <p className="card-preview-label">{t('anki.cardPreview.label')}</p>
          <p className="muted card-preview-profile">{profileHint}</p>
        </div>
        {mapping.exampleFallback && hasFieldTemplates(mapping.fallbackTemplates) && (
          <label className="card-preview-toggle">
            <input
              type="checkbox"
              checked={showFallback}
              onChange={(e) => setShowFallback(e.target.checked)}
            />
            {t('anki.cardPreview.expressionFallback')}
          </label>
        )}
      </div>

      <div className="card-preview-pair">
        <div className="card-preview-face">
          <div className="card-preview-face-label">{t('anki.cardPreview.front')}</div>
          <div className="card-preview-frame">
            <PreviewFrame
              html={preview.frontHtml}
              css={preview.css}
              title={t('anki.cardPreview.frameTitle')}
            />
          </div>
        </div>
        <div className="card-preview-face">
          <div className="card-preview-face-label">{t('anki.cardPreview.back')}</div>
          <div className="card-preview-frame">
            <PreviewFrame
              html={preview.backHtml}
              css={preview.css}
              title={t('anki.cardPreview.frameTitle')}
            />
          </div>
        </div>
      </div>

      <p className="muted card-preview-hint">{t('anki.cardPreview.sampleHint')}</p>
    </ContextualSurface>
  );
}
