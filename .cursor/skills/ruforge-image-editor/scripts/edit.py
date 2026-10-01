"""Spec-driven screenshot editor for website imagery.

Usage: python edit.py spec.json

All boxes are [x0, y0, x1, y1] in source pixels, measured after `crop`.
See the skill's SKILL.md for the spec fields and when to use each one.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


def load_spec(path):
    spec = json.loads(Path(path).read_text(encoding='utf-8'))
    for key in ('src', 'out'):
        if key not in spec:
            sys.exit(f'spec is missing "{key}"')
    return spec


def soften(img, s, blur=0, brightness=1.0, saturation=1.0):
    out = img.filter(ImageFilter.GaussianBlur(blur * s)) if blur else img
    if brightness != 1.0:
        out = ImageEnhance.Brightness(out).enhance(brightness)
    if saturation != 1.0:
        out = ImageEnhance.Color(out).enhance(saturation)
    return out


def rounded_mask(size, boxes, s, feather):
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    for item in boxes:
        x0, y0, x1, y1 = (round(v * s) for v in item['box'])
        draw.rounded_rectangle((x0, y0, x1, y1), radius=round(item.get('radius', 8) * s), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather * s)) if feather else mask


def drop_shadow(size, rect, radius, s, blur=18, alpha=170, dy=10):
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    x0, y0, x1, y1 = rect
    ImageDraw.Draw(layer).rounded_rectangle((x0, y0 + dy * s, x1, y1 + dy * s), radius=radius, fill=(0, 0, 0, alpha))
    return layer.filter(ImageFilter.GaussianBlur(blur * s))


def main():
    spec = load_spec(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
    s = spec.get('scale', 2)

    src = Image.open(spec['src']).convert('RGB')
    if 'crop' in spec:
        src = src.crop(tuple(spec['crop']))
    w, h = src.size
    big = src.resize((w * s, h * s), Image.LANCZOS)

    spot = big
    if spec.get('keep'):
        dim = soften(big, s, **spec.get('keepDim', {'blur': 3, 'brightness': 0.55, 'saturation': 0.55}))
        spot = Image.composite(big, dim, rounded_mask(big.size, spec['keep'], s, spec.get('feather', 0.8)))

    for d in spec.get('dims', []):
        if 'threshold' in d:
            # Scale only pixels brighter than the threshold: adjusts text and icons, leaves the surface behind them alone.
            t, gain = d['threshold'], d.get('gain', 1.0)
            soft = spot.point(lambda v: v if v < t else max(t, min(255, round(t + (v - t) * gain))))
        else:
            soft = soften(spot, s, blur=d.get('blur', 0), brightness=d.get('brightness', 0.45), saturation=d.get('saturation', 0.6))
        spot = Image.composite(soft, spot, rounded_mask(big.size, [d], s, d.get('feather', 0.8)))

    background = spec.get('background')
    canvas = (soften(big, s, **background) if background else spot).convert('RGBA')

    for z in spec.get('zooms', []):
        crop = spot.crop(tuple(round(v * s) for v in z['box']))
        zw, zh = round(crop.width * z['zoom']), round(crop.height * z['zoom'])
        crop = crop.resize((zw, zh), Image.LANCZOS)
        if z.get('sharpen'):
            crop = crop.filter(ImageFilter.UnsharpMask(radius=1.2 * s, percent=z['sharpen'], threshold=2))
        if z.get('contrast', 1.0) != 1.0:
            crop = ImageEnhance.Contrast(crop).enhance(z['contrast'])
        if z.get('brightness', 1.0) != 1.0:
            crop = ImageEnhance.Brightness(crop).enhance(z['brightness'])
        x, y = (round(v * s) for v in z['at'])
        rect = (x, y, x + zw, y + zh)
        radius = round(z.get('radius', 20) * s)
        canvas.alpha_composite(drop_shadow(canvas.size, rect, radius, s))
        m = Image.new('L', (zw, zh), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, zw - 1, zh - 1), radius=radius, fill=255)
        canvas.paste(crop, (x, y), m)
        border = z.get('border', 0.12)
        if border:
            ov = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
            ImageDraw.Draw(ov).rounded_rectangle(rect, radius=radius, outline=(255, 255, 255, round(255 * border)), width=max(1, round(1.5 * s)))
            canvas.alpha_composite(ov)

    for r in spec.get('rings', []):
        color = tuple(r.get('color', [167, 112, 255]))
        rect = tuple(round(v * s) for v in r['box'])
        radius = round(r.get('radius', 16) * s)
        glow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle(rect, radius=radius, outline=color + (210,), width=6 * s)
        canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9 * s)))
        line = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(line).rounded_rectangle(rect, radius=radius, outline=color + (255,), width=2 * s)
        canvas.alpha_composite(line)

    out_size = tuple(spec.get('resize', (w, h)))
    result = canvas.convert('RGB').resize(out_size, Image.LANCZOS)
    out = Path(spec['out'])
    out.parent.mkdir(parents=True, exist_ok=True)
    result.save(out, quality=spec.get('quality', 92), method=6)
    print(f'{out} {result.width}x{result.height}')


if __name__ == '__main__':
    main()
