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
import { useT } from '../i18n';

function FormatFacePreview({ label, text, emptyLabel }: { label: string; text: string; emptyLabel: string }) {
  return (
    <div className="ai-format-face">
      <div className="card-preview-face-label">{label}</div>
      <pre className="ai-format-face-body" lang="ja">
        {text || emptyLabel}
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
  const { t, lang } = useT();
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

  const sampleSubtitle = useMemo(
    () =>
      t('aiStudio.preview.sampleForPreset', {
        label: formatPreview?.label ?? localizedFormat.label,
      }),
    [lang, formatPreview?.label, localizedFormat.label],
  );

  const emptyFace = t('aiStudio.preview.emptyFace');

  return (
    <aside className="ai-studio-preview-column">
      <section className="card-preview ai-format-preview">
        <div className="card-preview-head">
          <div>
            <p className="card-preview-label">{t('aiStudio.preview.cardExample')}</p>
            <p className="muted card-preview-profile">{sampleSubtitle}</p>
          </div>
        </div>
        {formatPreview ? (
          <div className="card-preview-pair">
            <FormatFacePreview label={t('aiStudio.preview.front')} text={formatPreview.front} emptyLabel={emptyFace} />
            <FormatFacePreview label={t('aiStudio.preview.back')} text={formatPreview.back} emptyLabel={emptyFace} />
          </div>
        ) : (
          <p className="muted">{t('aiStudio.preview.noTemplate')}</p>
        )}
        <p className="muted card-preview-hint">{t('aiStudio.preview.facesHint')}</p>
      </section>

      <section className="card-preview ai-prompt-preview">
        <div className="card-preview-head">
          <div>
            <p className="card-preview-label">{t('aiStudio.preview.prompt')}</p>
            <p className="muted card-preview-profile">
              {generationSource === 'preset'
                ? t('aiStudio.preview.mode.invent')
                : t('aiStudio.preview.mode.enrich')}
            </p>
          </div>
        </div>
        <pre className="ai-prompt-body">{promptText}</pre>
        <p className="muted card-preview-hint">{t('aiStudio.preview.promptHint')}</p>
      </section>
    </aside>
  );
}
