"""Resize an alpha-cleaned connection tile without moving its edge anchors."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", type=int, default=512)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    tile = source.resize((args.size, args.size), Image.Resampling.LANCZOS)

    pixels = tile.load()
    for pixel_y in range(args.size):
        for pixel_x in range(args.size):
            red, green, blue, opacity = pixels[pixel_x, pixel_y]
            if opacity == 0:
                pixels[pixel_x, pixel_y] = (0, 0, 0, 0)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    tile.save(output, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
