// Gum (round-2 K1): which keys belong to the focused control rather than to the player.
//
// `VideoCoreKeybindingController` listens on `document`, so every key pressed anywhere in the
// window reaches it. Its only guard was "not typing in a field", so Enter or Space on a focused
// button — the study bar's "Replay line", a player menu item, the window's own title-bar
// buttons — was `preventDefault`-ed and turned into play/pause: a keyboard user could not press
// any button while a video was open (measured: Space on every focusable control toggled
// playback and activated nothing).
//
// The player keeps its single-letter and arrow keys while a plain button has focus (after a
// mouse click on the play button, focus stays there, and ← / → / M must still work). Only the
// keys the focused control itself defines are handed back:
//   - Enter / Space on anything activatable,
//   - arrows / Home / End / Page keys inside a composite widget (menu, listbox, slider, tabs...).

const ACTIVATABLE = [
    "button",
    "a[href]",
    "summary",
    "select",
    "input",
    "textarea",
    "[contenteditable='true']",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='menuitemcheckbox']",
    "[role='menuitemradio']",
    "[role='option']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='tab']",
    "[role='treeitem']",
].join(",")

const COMPOSITE = [
    "select",
    "input",
    "textarea",
    "[role='menu']",
    "[role='menubar']",
    "[role='listbox']",
    "[role='radiogroup']",
    "[role='tablist']",
    "[role='slider']",
    "[role='spinbutton']",
    "[role='tree']",
    "[role='grid']",
    "[role='combobox']",
].join(",")

const ACTIVATION_CODES = new Set(["Space", "Enter", "NumpadEnter"])
const NAVIGATION_CODES = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"])

export function keyBelongsToFocusedControl(e: Pick<KeyboardEvent, "code" | "key" | "target">): boolean {
    const target = e.target
    if (!(target instanceof Element)) return false
    const activation = ACTIVATION_CODES.has(e.code) || e.key === " " || e.key === "Enter"
    if (activation && target.closest(ACTIVATABLE)) return true
    const navigation = NAVIGATION_CODES.has(e.code)
    return navigation && !!target.closest(COMPOSITE)
}
