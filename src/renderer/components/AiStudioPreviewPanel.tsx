import { useMemo } from 'react';
import type {
  AiDeckGenerationSource,
  AiEngineConfig,
  AiLanguageOptions,
  AiMiningCardFormat,
  AiPromptPreset,
} from '../../shared/mining';
import { buildAiFormatSampleValues, buildAiPromptPreview, renderAiTemplate } from '../../shared/aiPromptBuilder';
import type { StudyProfile } from '../../shared/profiles';

function FormatFacePreview({ label, text }: { label: string; text: string }) {
  return (
    <div className="ai-format-face">
      <div className="card-preview-face-label">{label}</div>
      <pre className="ai-format-face-body" lang="ja">
        {text || '(empty)'}
      </pre>
    </div>
  );
}

export default function AiStudioPreviewPanel({
  preset,
  localizedFormat,
  mappingProfile,
  generationSource,
  aiConfig,
  wordCount,
}: {
  preset: AiPromptPreset;
  localizedFormat: AiMiningCardFormat;
  mappingProfile: StudyProfile;
  generationSource: AiDeckGenerationSource;
  aiConfig: AiEngineConfig;
  wordCount: number;
}) {
  const template = localizedFormat.cardTemplates[0];

  const formatPreview = useMemo(() => {
    if (!template) return null;
    const langOptions: AiLanguageOptions = {
      frontLang: aiConfig.frontLang,
      backLang: aiConfig.backLang,
      reverse: aiConfig.reverse,
      backGlossLangs: aiConfig.backGlossLangs,
    };
    const values = buildAiFormatSampleValues(preset.id, langOptions);
    return {
      label: template.label,
      front: renderAiTemplate(template.front, values),
      back: renderAiTemplate(template.back, values),
    };
  }, [template, preset.id, aiConfig.frontLang, aiConfig.backLang, aiConfig.reverse, aiConfig.backGlossLangs]);

  const promptText = useMemo(
    () =>
      buildAiPromptPreview({
        mode: generationSource,
        preset,
        localizedFormat,
        langOptions: {
          frontLang: aiConfig.frontLang,
          backLang: aiConfig.backLang,
          reverse: aiConfig.reverse,
          backGlossLangs: aiConfig.backGlossLangs,
        },
        cardCount: aiConfig.cardCount,
        outputFormat: aiConfig.outputFormat,
        templateFront: template?.front ?? '{expression}',
        templateBack: template?.back ?? '{meaning}',
        targetLang: mappingProfile.targetLang,
        wordCount,
      }),
    [generationSource, preset, localizedFormat, aiConfig, template, mappingProfile.targetLang, wordCount],
  );

  return (
    <aside className="ai-studio-preview-column">
      <section className="card-preview ai-format-preview">
        <div className="card-preview-head">
          <div>
            <p className="card-preview-label">AI card example</p>
            <p className="muted card-preview-profile">
              {formatPreview?.label ?? localizedFormat.label} — sample content for this preset
            </p>
          </div>
        </div>
        {formatPreview ? (
          <div className="card-preview-pair">
            <FormatFacePreview label="Front" text={formatPreview.front} />
            <FormatFacePreview label="Back" text={formatPreview.back} />
          </div>
        ) : (
          <p className="muted">No card template for this format.</p>
        )}
        <p className="muted card-preview-hint">
          Faces above use the preset format after language direction is applied. Sending to Anki runs the field
          mapping on the left.
        </p>
      </section>

      <section className="card-preview ai-prompt-preview">
        <div className="card-preview-head">
          <div>
            <p className="card-preview-label">AI prompt</p>
            <p className="muted card-preview-profile">
              {generationSource === 'preset' ? 'Invent vocabulary mode' : 'Dictionary enrichment mode'}
            </p>
          </div>
        </div>
        <pre className="ai-prompt-body">{promptText}</pre>
        <p className="muted card-preview-hint">
          Composed from preset instruction, language direction, profile id, and active card templates.
        </p>
      </section>
    </aside>
  );
}
