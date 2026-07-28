from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageOps


FRAME_TIMES = {
    'bronze': 54,
    'bark_slate': 60,
    'paver_172': 172,
    'grass_red': 180,
    'hedge': 190,
    'curb': 342,
    'paver_434': 434,
}

# Coordinates are in the video's native 1920x1080 frame.
CROPS = {
    'bronze': ('bronze', (1130, 95, 1360, 305)),
    'bark': ('bark_slate', (515, 50, 710, 790)),
    'slate': ('bark_slate', (100, 370, 700, 690)),
    'paver_172': ('paver_172', (0, 500, 1920, 1080)),
    'grass': ('grass_red', (0, 400, 800, 1050)),
    'red_granite': ('grass_red', (720, 80, 1080, 560)),
    'hedge': ('hedge', (150, 240, 900, 700)),
    'curb': ('curb', (0, 400, 1920, 1080)),
    'paver_434': ('paver_434', (0, 430, 1920, 1080)),
}


def extract_frame(video: Path, seconds: int, output: Path) -> None:
    subprocess.run(
        [
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-ss', str(seconds),
            '-i', str(video), '-frames:v', '1', '-q:v', '2', str(output),
        ],
        check=True,
    )


def mirror_tile(image: Image.Image, size: int = 1024) -> Image.Image:
    base = ImageOps.fit(image.convert('RGB'), (size // 2, size // 2), method=Image.Resampling.LANCZOS)
    tile = Image.new('RGB', (size, size))
    tile.paste(base, (0, 0))
    tile.paste(ImageOps.mirror(base), (size // 2, 0))
    tile.paste(ImageOps.flip(base), (0, size // 2))
    tile.paste(ImageOps.flip(ImageOps.mirror(base)), (size // 2, size // 2))
    return tile


def highpass_height(image: Image.Image, radius: float = 10.0, contrast: float = 1.55) -> Image.Image:
    gray = ImageOps.grayscale(image)
    low = gray.filter(ImageFilter.GaussianBlur(radius))
    detail = ImageChops.subtract(gray, low, scale=1.0, offset=128)
    detail = ImageEnhance.Contrast(detail).enhance(contrast)
    return ImageOps.autocontrast(detail, cutoff=1)


def colour_grade(image: Image.Image, brightness: float = 1.0, contrast: float = 1.0, saturation: float = 1.0) -> Image.Image:
    out = ImageEnhance.Brightness(image).enhance(brightness)
    out = ImageEnhance.Contrast(out).enhance(contrast)
    out = ImageEnhance.Color(out).enhance(saturation)
    return out


def masked_texture(image: Image.Image, kind: str) -> Image.Image:
    arr = np.asarray(image.convert('RGB'), dtype=np.uint8)
    r = arr[..., 0].astype(np.float32)
    g = arr[..., 1].astype(np.float32)
    b = arr[..., 2].astype(np.float32)
    if kind == 'bronze':
        mask = (r > 42) & (r < 190) & (g > 34) & (g < 175) & (b < 145) & (r > b * .92)
    elif kind == 'red_granite':
        mask = (r > 70) & (r < 235) & (r > g * 1.12) & (r > b * 1.08)
    elif kind == 'bark':
        mask = (r < 135) & (g < 135) & (b < 120) & (r > 18)
    else:
        mask = np.ones(arr.shape[:2], dtype=bool)
    if int(mask.sum()) < 100:
        return image.convert('RGB')
    median = np.median(arr[mask], axis=0)
    # Preserve genuine surface detail; suppress obvious sky/building/grass pixels.
    filled = arr.astype(np.float32)
    filled[~mask] = median
    result = Image.fromarray(np.uint8(np.clip(filled, 0, 255)), 'RGB')
    return result.filter(ImageFilter.MedianFilter(3))


def blend_existing(path: Path, source: Image.Image, alpha: float, *, brightness: float = 1.0, contrast: float = 1.0, saturation: float = 1.0) -> None:
    existing = Image.open(path).convert('RGB').resize(source.size, Image.Resampling.LANCZOS)
    source = colour_grade(source, brightness, contrast, saturation)
    Image.blend(existing, source, alpha).save(path, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--texture-dir', type=Path, required=True)
    parser.add_argument('--debug-dir', type=Path)
    args = parser.parse_args()
    args.texture_dir.mkdir(parents=True, exist_ok=True)
    debug = args.debug_dir or args.texture_dir / '_source_debug'
    debug.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix='yatsukusa_frames_') as td:
        td_path = Path(td)
        frames: dict[str, Image.Image] = {}
        for name, seconds in FRAME_TIMES.items():
            frame_path = td_path / f'{name}.jpg'
            extract_frame(args.video, seconds, frame_path)
            frames[name] = Image.open(frame_path).convert('RGB')

        crops: dict[str, Image.Image] = {}
        for name, (frame_name, box) in CROPS.items():
            crop = frames[frame_name].crop(box)
            crops[name] = crop
            crop.save(debug / f'{name}_crop.jpg', quality=93)

        paver_source = mirror_tile(crops['paver_172'], 1024)
        paver_alt = mirror_tile(crops['paver_434'], 1024)
        paver_source = Image.blend(paver_source, paver_alt, .28)
        blend_existing(args.texture_dir / 'paver_base.png', paver_source, .62, brightness=.72, contrast=1.08, saturation=.58)
        Image.blend(
            Image.open(args.texture_dir / 'paver_height.png').convert('L'),
            highpass_height(paver_source, 8, 1.8),
            .58,
        ).save(args.texture_dir / 'paver_height.png', optimize=True)

        grass_source = mirror_tile(crops['grass'], 1024)
        blend_existing(args.texture_dir / 'grass_base.png', grass_source, .68, brightness=.72, contrast=1.06, saturation=.78)
        Image.blend(
            Image.open(args.texture_dir / 'grass_height.png').convert('L'),
            highpass_height(grass_source, 9, 1.45),
            .55,
        ).save(args.texture_dir / 'grass_height.png', optimize=True)

        bark_source = mirror_tile(masked_texture(crops['bark'], 'bark'), 512)
        blend_existing(args.texture_dir / 'bark_base.png', bark_source, .72, brightness=.62, contrast=1.22, saturation=.72)
        Image.blend(
            Image.open(args.texture_dir / 'bark_height.png').convert('L'),
            highpass_height(bark_source, 6, 2.0),
            .68,
        ).save(args.texture_dir / 'bark_height.png', optimize=True)

        hedge_source = mirror_tile(crops['hedge'], 1024)
        hedge_source = colour_grade(hedge_source, .66, 1.18, .92)
        hedge_source.save(args.texture_dir / 'hedge_base.png', optimize=True)
        colour_grade(hedge_source, 1.12, .96, 1.02).save(args.texture_dir / 'hedge_light_base.png', optimize=True)
        highpass_height(hedge_source, 7, 1.9).save(args.texture_dir / 'hedge_height.png', optimize=True)

        bronze_source = mirror_tile(masked_texture(crops['bronze'], 'bronze'), 1024)
        bronze_source = colour_grade(bronze_source, .72, 1.13, .78)
        bronze_source.save(args.texture_dir / 'bronze_base.png', optimize=True)
        highpass_height(bronze_source, 8, 1.42).save(args.texture_dir / 'bronze_height.png', optimize=True)

        granite_source = mirror_tile(masked_texture(crops['red_granite'], 'red_granite'), 1024)
        granite_source = colour_grade(granite_source, .74, 1.22, .92)
        granite_source.save(args.texture_dir / 'red_granite_base.png', optimize=True)
        highpass_height(granite_source, 4, 2.25).save(args.texture_dir / 'red_granite_height.png', optimize=True)

        slate_source = mirror_tile(crops['slate'], 1024)
        slate_source = colour_grade(slate_source, .48, 1.24, .42)
        slate_source.save(args.texture_dir / 'slate_base.png', optimize=True)
        highpass_height(slate_source, 7, 1.85).save(args.texture_dir / 'slate_height.png', optimize=True)

        curb_source = mirror_tile(crops['curb'], 1024)
        curb_source = colour_grade(curb_source, .50, 1.30, .30)
        curb_source.save(args.texture_dir / 'curb_base.png', optimize=True)
        highpass_height(curb_source, 6, 1.75).save(args.texture_dir / 'curb_height.png', optimize=True)

        # Densify and darken foliage cards. Their alpha stays cutout, but clusters no
        # longer read as isolated fluorescent pom-poms.
        for name in ('leaf_cluster_a.png', 'leaf_cluster_b.png', 'leaf_cluster_c.png'):
            path = args.texture_dir / name
            leaf = Image.open(path).convert('RGBA')
            rgb = colour_grade(leaf.convert('RGB'), .64, 1.15, .90)
            alpha = leaf.getchannel('A').filter(ImageFilter.MaxFilter(5))
            alpha = ImageEnhance.Contrast(alpha).enhance(1.08)
            rgb.putalpha(alpha)
            rgb.save(path, optimize=True)

        blade_path = args.texture_dir / 'grass_blade.png'
        blade = Image.open(blade_path).convert('RGBA')
        blade_rgb = colour_grade(blade.convert('RGB'), .55, 1.12, .82)
        blade_alpha = ImageEnhance.Brightness(blade.getchannel('A')).enhance(.72)
        blade_rgb.putalpha(blade_alpha)
        blade_rgb.save(blade_path, optimize=True)

    produced = sorted(p.name for p in args.texture_dir.glob('*.png'))
    print(f'video-grounded textures: {len(produced)} files')
    print('\n'.join(produced))


if __name__ == '__main__':
    main()
