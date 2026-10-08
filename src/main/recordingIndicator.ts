/**
 * The one tray red dot that says "Gum is capturing right now".
 *
 * System-audio capture (`systemAudioCapture.ts`) and the Region Recorder
 * (`regionRecorder.ts`) each own a section of it. The dot is shown while any
 * owner has a section and removed when the last one clears its own; the
 * tooltip lists every owner's line and the context menu stacks their items.
 * A left click runs the most recent owner's `onClick`.
 */
import { Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron';

export interface RecordingIndicatorSection {
  tooltip: string;
  menu: MenuItemConstructorOptions[];
  onClick?: () => void;
}

const sections = new Map<string, RecordingIndicatorSection>();
let tray: Tray | null = null;

/** A 16 px deep-red dot — "recording", in the app's accent. */
function indicatorIcon(): Electron.NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const alpha = Math.max(0, Math.min(1, 6.5 - d));
      const i = (y * size + x) * 4;
      // BGRA
      buf[i] = 0x2a;
      buf[i + 1] = 0x1c;
      buf[i + 2] = 0xb0;
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function destroyTray(): void {
  if (!tray) return;
  try {
    tray.destroy();
  } catch {
    /* already gone */
  }
  tray = null;
}

function refresh(): void {
  if (!sections.size) {
    destroyTray();
    return;
  }
  if (!tray) {
    try {
      tray = new Tray(indicatorIcon());
      tray.on('click', () => {
        const last = [...sections.values()].reverse().find((s) => s.onClick);
        last?.onClick?.();
      });
    } catch {
      tray = null;
      return;
    }
  }
  const all = [...sections.values()];
  tray.setToolTip(all.map((s) => s.tooltip).join('\n'));
  const template: MenuItemConstructorOptions[] = [];
  all.forEach((s, i) => {
    if (i > 0) template.push({ type: 'separator' });
    template.push(...s.menu);
  });
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

/** Set (or with `null` clear) this owner's section of the indicator. */
export function setRecordingIndicator(owner: string, section: RecordingIndicatorSection | null): void {
  if (section) sections.set(owner, section);
  else sections.delete(owner);
  refresh();
}

/** On quit: the dot goes whatever its owners think. */
export function destroyRecordingIndicator(): void {
  sections.clear();
  destroyTray();
}

export function recordingIndicatorOwners(): string[] {
  return [...sections.keys()];
}
