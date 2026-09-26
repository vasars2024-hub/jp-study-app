# Companion sprite packs — licence

Every image in this folder (`beni/`, `yuzu/`, `tock/`, `orbi/`, `ping/` and
`guide-portrait.png`) is original art made for Gum. It is drawn entirely from
geometric primitives by `tools/generate-companion-sprites.cjs`; no third-party
character, sprite sheet or reference image was traced, sampled or used.

The characters — Beni, Yuzu, Tock, Orbi and Ping — and their images are dedicated
to the public domain under **CC0 1.0 Universal**
(https://creativecommons.org/publicdomain/zero/1.0/). You may copy, modify and
redistribute them for any purpose without asking. The code that draws them is
part of Gum and stays under the repository's GPL-3.0 licence.

To regenerate: `node tools/generate-companion-sprites.cjs`.

Sprite packs a user imports are stored in their own profile
(`<userData>/companion-packs/`) and never enter this repository.
