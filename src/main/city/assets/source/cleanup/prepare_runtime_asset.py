"""Normalize an isolated straight-alpha source to a registered square runtime PNG."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--padding", type=int, default=24)
    parser.add_argument("--anchor-y", type=float, default=0.94)
    parser.add_argument("--scale-x", type=float, default=1.0)
    parser.add_argument("--scale-y", type=float, default=1.0)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    alpha = source.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise SystemExit("input has no visible pixels")

    subject = source.crop(bounds)
    available_width = args.size - args.padding * 2
    anchor_row = round(args.size * args.anchor_y)
    available_height = anchor_row - args.padding
    scale = min(available_width / subject.width, available_height / subject.height)
    new_size = (
        max(1, round(subject.width * scale * args.scale_x)),
        max(1, round(subject.height * scale * args.scale_y)),
    )
    subject = subject.resize(new_size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (args.size, args.size), (0, 0, 0, 0))
    x = (args.size - subject.width) // 2
    y = anchor_row - subject.height
    canvas.alpha_composite(subject, (x, y))

    pixels = canvas.load()
    for pixel_y in range(args.size):
        for pixel_x in range(args.size):
            red, green, blue, opacity = pixels[pixel_x, pixel_y]
            if opacity == 0:
                pixels[pixel_x, pixel_y] = (0, 0, 0, 0)

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
