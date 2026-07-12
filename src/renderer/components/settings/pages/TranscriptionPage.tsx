import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';

export default function TranscriptionPage() {
  const { whisperDevice, chooseWhisperDevice, focusSettingId } = useSettings();
  return (
    <SettingsCard
      id="whisper"
      title="Transcription device"
      description="How subtitle generation runs in the Media app."
      highlight={focusSettingId === 'whisper'}
    >
      <div className="sp-seg" role="group" aria-label="Transcription device">
        <button
          type="button"
          className={`sp-seg-btn ${whisperDevice === 'auto' ? 'active' : ''}`}
          onClick={() => chooseWhisperDevice('auto')}
          title="Use the GPU when available — much faster"
        >
          GPU
        </button>
        <button
          type="button"
          className={`sp-seg-btn ${whisperDevice === 'cpu' ? 'active' : ''}`}
          onClick={() => chooseWhisperDevice('cpu')}
          title="Force CPU — slower but works without a GPU"
        >
          CPU
        </button>
      </div>
    </SettingsCard>
  );
}
