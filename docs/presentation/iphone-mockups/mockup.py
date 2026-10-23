"""Put phone screenshots (390x800 @2x) into the iPhone frame from docs/assets.

usage: python mockup.py <frame.png> <out_dir> <screenshot.png>...

The screen opening of the frame is found by flood fill (transparent pixels around the centre). The screenshot is
scaled to the opening width and placed under an iOS-style status bar (time · signal · Wi-Fi · battery) whose
height matches the camera island; the result is clipped to the rounded opening and the frame is drawn on top.
"""
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_BOLD = "C:/Windows/Fonts/seguisb.ttf"  # Segoe UI Semibold — close to SF Pro on Windows


def screen_mask(frame: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    alpha = np.array(frame)[:, :, 3]
    h, w = alpha.shape
    clear = alpha < 128
    seen = np.zeros_like(clear)
    q = deque([(h // 2, w // 2)])
    seen[h // 2, w // 2] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and clear[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    ys, xs = np.nonzero(seen)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    # grow by 3 px so the screenshot reaches under the anti-aliased inner edge of the bezel
    mask = Image.fromarray((seen * 255).astype("uint8")).filter(ImageFilter.MaxFilter(7))
    return mask, box


def island_box(frame: Image.Image, box) -> tuple[int, int, int, int]:
    """Opaque blob in the top centre of the opening (Dynamic Island)."""
    alpha = np.array(frame)[:, :, 3]
    x0, y0, x1, _ = box
    cx = (x0 + x1) // 2
    sub = alpha[y0 + 8 : y0 + 200, cx - 200 : cx + 200] > 128
    ys, xs = np.nonzero(sub)
    return (int(xs.min()) + cx - 200, int(ys.min()) + y0 + 8, int(xs.max()) + cx - 200, int(ys.max()) + y0 + 8)


def status_bar(draw: ImageDraw.ImageDraw, w: int, h: int, island, ox: int, oy: int, ink=(17, 17, 17)):
    """iOS status bar: «9:41» left of the island, signal / Wi-Fi / battery right of it, centred on the island."""
    ix0, iy0, ix1, iy1 = (island[0] - ox, island[1] - oy, island[2] - ox, island[3] - oy)
    cy = (iy0 + iy1) / 2
    size = round((iy1 - iy0) * 0.5)
    font = ImageFont.truetype(FONT_BOLD, size)
    tw = draw.textlength("9:41", font=font)
    draw.text((ix0 / 2 - tw / 2, cy), "9:41", font=font, fill=ink, anchor="lm")
    # right group, centred between the island and the right edge
    u = size / 17  # unit ≈ 1 pt
    group_w = 18 * u + 6 * u + 16 * u + 6 * u + 26 * u
    x = (ix1 + w) / 2 - group_w / 2
    # signal: 4 bars
    for i in range(4):
        bh = (4 + i * 2.6) * u
        draw.rounded_rectangle((x + i * 4.6 * u, cy + 5.5 * u - bh, x + i * 4.6 * u + 3.2 * u, cy + 5.5 * u), radius=u, fill=ink)
    x += 18 * u + 6 * u
    # Wi-Fi: three arcs + dot
    wx, wy = x + 8 * u, cy + 5 * u
    for r, wdt in ((11.5 * u, 2.4 * u), (7.6 * u, 2.4 * u), (3.6 * u, 2.4 * u)):
        draw.arc((wx - r, wy - r, wx + r, wy + r), start=225, end=315, fill=ink, width=max(1, round(wdt)))
    draw.ellipse((wx - 1.6 * u, wy - 2.2 * u, wx + 1.6 * u, wy + 1 * u), fill=ink)
    x += 16 * u + 6 * u
    # battery: body, level, nub
    bw, bh = 23 * u, 11.5 * u
    draw.rounded_rectangle((x, cy - bh / 2, x + bw, cy + bh / 2), radius=3.4 * u, outline=ink, width=max(1, round(1.1 * u)))
    draw.rounded_rectangle((x + 2 * u, cy - bh / 2 + 2 * u, x + bw * 0.8, cy + bh / 2 - 2 * u), radius=1.6 * u, fill=ink)
    draw.rounded_rectangle((x + bw + 1.2 * u, cy - 2 * u, x + bw + 2.6 * u, cy + 2 * u), radius=0.8 * u, fill=ink)


def compose(frame: Image.Image, mask: Image.Image, box, island, shot_path: Path) -> Image.Image:
    x0, y0, x1, y1 = box
    sw, sh = x1 - x0, y1 - y0
    shot = Image.open(shot_path).convert("RGB")
    scaled = shot.resize((sw, round(shot.height * sw / shot.width)), Image.LANCZOS)
    bar_h = max(sh - scaled.height, island[3] - y0 + 8)
    # iPhone home-indicator area (≈34 pt of 874): the app's bottom bar sits above it, as with safe-area insets
    home_h = round(sh * 34 / 874)
    tab_h = round(65 * 2 * sw / shot.width)  # bottom tab bar: 64 css px + 1 px border at 2x
    content_h = sh - bar_h - home_h - tab_h
    # the space for the indicator is taken from the top of the page body (just under the app header), so the
    # header and bottom-anchored elements (sticky submit bar, sheet footer, tab bar) stay intact
    hdr_h = round(57 * 2 * sw / shot.width)  # app header: 56 css px + 1 px border at 2x
    cut = scaled.height - tab_h - content_h  # rows of page body that do not fit
    top_cut = min(cut, round(22 * 2 * sw / shot.width))  # page top padding is 24 css px of empty space
    bottom_cut = cut - top_cut  # the rest from the gap above the tab bar (sticky bars keep a 12 px margin)
    body = scaled.crop((0, hdr_h + top_cut, sw, scaled.height - tab_h - bottom_cut))
    content = Image.new("RGB", (sw, content_h))
    content.paste(scaled.crop((0, 0, sw, hdr_h)), (0, 0))
    content.paste(body, (0, hdr_h))
    tab = scaled.crop((0, scaled.height - tab_h, sw, scaled.height))
    bg = shot.getpixel((shot.width // 2, 6))  # colour of the app header → status bar background
    tab_bg = shot.getpixel((4, shot.height - 4))  # colour of the bottom bar → home-indicator strip
    screen = Image.new("RGB", (sw, sh), bg)
    screen.paste(content, (0, bar_h))
    screen.paste(tab, (0, bar_h + content_h))
    draw = ImageDraw.Draw(screen)
    draw.rectangle((0, sh - home_h, sw, sh), fill=tab_bg)
    iw = round(sw * 0.35)
    draw.rounded_rectangle(((sw - iw) / 2, sh - home_h * 0.42 - 4, (sw + iw) / 2, sh - home_h * 0.42 + 4), radius=4, fill=(17, 17, 17))
    status_bar(draw, sw, bar_h, island, x0, y0)
    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    canvas.paste(screen, (x0, y0), mask.crop(box))
    canvas.alpha_composite(frame)
    # trim to the phone (+ a few px of its soft edge)
    a = np.array(canvas)[:, :, 3]
    ys, xs = np.nonzero(a > 8)
    return canvas.crop((max(int(xs.min()) - 2, 0), max(int(ys.min()) - 2, 0), int(xs.max()) + 3, int(ys.max()) + 3))


def main():
    frame = Image.open(sys.argv[1]).convert("RGBA")
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    mask, box = screen_mask(frame)
    island = island_box(frame, box)
    print("screen", box, "island", island)
    for p in map(Path, sys.argv[3:]):
        img = compose(frame, mask, box, island, p)
        name = f"{p.parent.name}_{p.stem}.png"
        img.save(out_dir / name, optimize=True)
        print(name, img.size)


if __name__ == "__main__":
    main()
