import React, { createContext, useContext } from 'react';
import { toast } from 'sonner';
import {
  useHandlePlayMedia as useUpstreamPlayMedia,
  useForcePlaybackMethod,
} from '../../vendor/seanime-web/app/(main)/entry/_lib/handle-play-media';
import { ElectronPlaybackMethod, useCurrentDevicePlaybackSettings } from '@/app/(main)/_atoms/playback.atoms';
import { useTorrentstreamAutoplay } from '@/app/(main)/_features/autoplay/autoplay';
import { useT } from '../renderer/i18n';

// Keep one force-method store for the adopted context menus and fallback handler.
export { useForcePlaybackMethod } from '../../vendor/seanime-web/app/(main)/entry/_lib/handle-play-media';
export type { ForcePlaybackMethod } from '../../vendor/seanime-web/app/(main)/entry/_lib/handle-play-media';

type LocalFileOpener = (path: string) => boolean;
const LocalPlaybackContext = createContext<LocalFileOpener | null>(null);

/** The library host supplies its existing request channel, including recovery and resume. */
export function LocalPlaybackProvider({ onOpen, children }: {
  onOpen: LocalFileOpener;
  children: React.ReactNode;
}): React.ReactElement {
  return <LocalPlaybackContext.Provider value={onOpen}>{children}</LocalPlaybackContext.Provider>;
}

/**
 * The exact entry hook is aliased here by Vite; upstream remains byte-identical.
 * Study OS is an Electron host, but is not upstream's Denshi desktop application.
 * Enabling its global desktop flag also changes torrent/debrid and platform APIs.
 * Only local library requests belong to this adapter; explicit external and remote
 * playback retain the upstream handler and its one-shot override semantics.
 */
export function useHandlePlayMedia(): ReturnType<typeof useUpstreamPlayMedia> {
  const upstream = useUpstreamPlayMedia();
  const { electronPlaybackMethod } = useCurrentDevicePlaybackSettings();
  const { getForcePlaybackMethod, resetForcePlaybackMethod } = useForcePlaybackMethod();
  const { setTorrentstreamAutoplayInfo } = useTorrentstreamAutoplay();
  const openLocal = useContext(LocalPlaybackContext);
  const { t } = useT();
  const nativeSelected = electronPlaybackMethod === ElectronPlaybackMethod.NativePlayer;
  return {
    isUsingNativePlayer: nativeSelected && openLocal !== null,
    playMediaFile(request) {
      const forced = getForcePlaybackMethod();
      const native = forced ? forced === 'nativeplayer' : nativeSelected;
      if (!native || request.episode._isNakamaEpisode) {
        return upstream.playMediaFile(request);
      }
      resetForcePlaybackMethod();
      setTorrentstreamAutoplayInfo(null);
      if (!request.path.trim()) {
        toast.error(t('mediaWorkspace.localPlayback.noPath'));
      } else if (!openLocal?.(request.path)) {
        toast.error(t('mediaWorkspace.localPlayback.noHost'));
      }
    },
  };
}
