"""Create a neutral emissive mask from a cleaned base within a bounded organ region."""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageFilter


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--center-x", type=float, default=0.5)
    parser.add_argument("--center-y", type=float, default=0.735)
    parser.add_argument("--radius-x", type=float, default=0.125)
    parser.add_argument("--radius-y", type=float, default=0.07)
    parser.add_argument("--blur", type=float, default=0.7)
    return parser.parse_args()


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    unit = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return unit * unit * (3.0 - 2.0 * unit)


def main() -> None:
    args = parse_args()
    source = Image.open(args.input).convert("RGBA")
    width, height = source.size
    center_x = args.center_x * width
    center_y = args.center_y * height
    radius_x = args.radius_x * width
    radius_y = args.radius_y * height

    grayscale = Image.new("L", source.size, 0)
    source_pixels = source.load()
    mask_pixels = grayscale.load()

    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = source_pixels[x, y]
            if alpha == 0:
                continue
            distance = math.sqrt(
                ((x - center_x) / radius_x) ** 2
                + ((y - center_y) / radius_y) ** 2
            )
            if distance >= 1.0:
                continue

            region_weight = 1.0 - smoothstep(0.72, 1.0, distance)
            luminance = red * 0.42 + green * 0.46 + blue * 0.12
            warm_separation = max(0.0, red * 0.72 + green * 0.28 - blue * 1.15)
            material_weight = smoothstep(58.0, 142.0, luminance + warm_separation * 0.48)
            value = round(255 * region_weight * material_weight * (alpha / 255))
            mask_pixels[x, y] = max(0, min(255, value))

    if args.blur > 0:
        grayscale = grayscale.filter(ImageFilter.GaussianBlur(args.blur))

    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    output_pixels = output.load()
    grayscale_pixels = grayscale.load()
    for y in range(height):
        for x in range(width):
            value = grayscale_pixels[x, y]
            if value:
                output_pixels[x, y] = (value, value, value, value)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output.save(output_path, format="PNG", optimize=True)


if __name__ == "__main__":
    main()
