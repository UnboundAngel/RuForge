"""Save a magnified crop with a labeled pixel grid, for measuring edit boxes.

Usage: python probe.py SRC X0 Y0 X1 Y1 OUT.png [ZOOM] [STEP]
Grid lines every STEP source pixels (default 10), labeled every 5th line.
"""
import sys

from PIL import Image, ImageDraw


def main():
    if len(sys.argv) < 7:
        sys.exit(__doc__)
    src, x0, y0, x1, y1, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
    zoom = int(sys.argv[7]) if len(sys.argv) > 7 else 4
    step = int(sys.argv[8]) if len(sys.argv) > 8 else 10

    crop = Image.open(src).convert('RGB').crop((x0, y0, x1, y1))
    img = crop.resize((crop.width * zoom, crop.height * zoom), Image.NEAREST)
    draw = ImageDraw.Draw(img, 'RGBA')

    for x in range(x0 - x0 % step + step, x1, step):
        px = (x - x0) * zoom
        major = x % (step * 5) == 0
        draw.line((px, 0, px, img.height), fill=(0, 255, 255, 150 if major else 60))
        if major:
            draw.text((px + 2, 2), str(x), fill=(0, 255, 255, 255))
    for y in range(y0 - y0 % step + step, y1, step):
        py = (y - y0) * zoom
        major = y % (step * 5) == 0
        draw.line((0, py, img.width, py), fill=(255, 0, 255, 150 if major else 60))
        if major:
            draw.text((2, py + 2), str(y), fill=(255, 0, 255, 255))

    img.save(out)
    print(f'{out} {img.width}x{img.height}')


if __name__ == '__main__':
    main()
