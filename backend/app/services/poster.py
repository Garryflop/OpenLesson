"""Модуль 4. Генерация постера-приглашения «OPEN LESSON» (PNG + PDF, A4).

All poster texts (labels, dates, school name, default invitation) follow the ``poster_language``
setting (kk | ru | en), not the language of the user who triggered the generation.
"""

from functools import lru_cache
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy.orm import Session

from app import clock
from app.config import BASE_DIR, settings
from app.i18n import pick, tr, use_lang
from app.models import OpenLesson
from app.services import app_settings, storage
from app.services.fonts import font_path
from app.utils import fmt_date, fmt_range

W, H = 1240, 1754  # A4 @ 150 dpi
MARGIN = 90
INK = (57, 48, 38)  # AITU logo dark brown
MUTED = (96, 92, 86)
DEFAULT_LOGO = BASE_DIR / "app" / "data" / "aitu-logo.png"


@lru_cache(maxsize=64)
def _font(weight: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    path = font_path(weight)
    if path:
        return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def _hex(color: str, alpha: int | None = None) -> tuple:
    color = color.lstrip("#")
    rgb = tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))
    return rgb + (alpha,) if alpha is not None else rgb


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int, max_lines: int) -> list[str]:
    words, lines, line = text.split(), [], ""
    for word in words:
        probe = f"{line} {word}".strip()
        if draw.textlength(probe, font=font) <= width:
            line = probe
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines[-1] and draw.textlength(lines[-1] + "…", font=font) > width:
            lines[-1] = lines[-1][:-1]
        lines[-1] = lines[-1].rstrip() + "…"
    return lines


def _mix(color: tuple, other: tuple, t: float) -> tuple:
    return tuple(round(c * (1 - t) + o * t) for c, o in zip(color, other))


def _icon(draw: ImageDraw.ImageDraw, kind: str, x: int, y: int, color: tuple) -> None:
    """Simple line icons drawn on a tinted circle (calendar / clock / pin)."""
    r = 34
    draw.ellipse((x, y, x + 2 * r, y + 2 * r), fill=_mix(color, (255, 255, 255), 0.82))
    cx, cy = x + r, y + r
    stroke = color
    if kind == "calendar":
        draw.rounded_rectangle((cx - 16, cy - 13, cx + 16, cy + 16), 4, outline=stroke, width=4)
        draw.line((cx - 16, cy - 4, cx + 16, cy - 4), fill=stroke, width=4)
        draw.line((cx - 8, cy - 19, cx - 8, cy - 9), fill=stroke, width=4)
        draw.line((cx + 8, cy - 19, cx + 8, cy - 9), fill=stroke, width=4)
    elif kind == "clock":
        draw.ellipse((cx - 17, cy - 17, cx + 17, cy + 17), outline=stroke, width=4)
        draw.line((cx, cy - 9, cx, cy + 1), fill=stroke, width=4)
        draw.line((cx, cy + 1, cx + 8, cy + 6), fill=stroke, width=4)
    else:  # pin
        draw.ellipse((cx - 14, cy - 19, cx + 14, cy + 9), outline=stroke, width=4)
        draw.polygon([(cx - 11, cy + 3), (cx + 11, cy + 3), (cx, cy + 20)], fill=stroke)
        draw.ellipse((cx - 5, cy - 10, cx + 5, cy), fill=stroke)


def _logo(canvas: Image.Image, draw: ImageDraw.ImageDraw, logo_file: str | None, x: int, y: int) -> None:
    """Official logo on a white plate (custom upload from settings, else the bundled AITU logo)."""
    path = storage.root() / "branding" / logo_file if logo_file else DEFAULT_LOGO
    if not path.exists():
        path = DEFAULT_LOGO
    logo = Image.open(path).convert("RGBA")
    bbox = logo.getchannel("A").getbbox()
    if bbox:
        logo = logo.crop(bbox)
    logo.thumbnail((300, 118), Image.LANCZOS)
    pad_x, pad_y = 26, 18
    draw.rounded_rectangle((x, y, x + logo.width + 2 * pad_x, y + logo.height + 2 * pad_y), 24, fill=(255, 255, 255))
    canvas.alpha_composite(logo, (x + pad_x, y + pad_y))


def render(lesson: OpenLesson, cfg: dict, invitation: str) -> Image.Image:
    primary = _hex(cfg.get("poster_primary_color") or "#12344F")
    accent = _hex(cfg.get("poster_accent_color") or "#2E9DCA")

    img = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    header_h = 560
    ImageDraw.Draw(img).rectangle((0, 0, W, header_h), fill=primary)
    # translucent geometric accents, composited over the navy band
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    o = ImageDraw.Draw(overlay)
    o.ellipse((W - 470, -330, W + 230, 370), fill=accent + (55,))
    o.ellipse((W - 290, 250, W + 110, 650), fill=accent + (95,))
    o.polygon([(0, header_h - 110), (380, header_h), (0, header_h)], fill=accent + (85,))
    img.alpha_composite(overlay)
    ImageDraw.Draw(img).rectangle((0, header_h, W, H), fill=(255, 255, 255))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(overlay).ellipse((W - 290, 250, W + 110, 650), fill=accent + (95,))
    img.alpha_composite(overlay.crop((0, header_h, W, H)), (0, header_h))
    d = ImageDraw.Draw(img)

    _logo(img, d, cfg.get("poster_logo"), MARGIN, 64)

    d.text((MARGIN, 236), "OPEN", font=_font("black", 138), fill=(255, 255, 255))
    d.text((MARGIN, 372), "LESSON", font=_font("black", 138), fill=accent)
    d.text((W - MARGIN, 96), tr("ОТКРЫТОЕ ЗАНЯТИЕ", "INVITATION", "ШАҚЫРУ"), font=_font("bold", 28), fill=(255, 255, 255), anchor="ra")
    trimester = lesson.trimester
    roman, year = trimester.roman, trimester.year.name
    d.text(
        (W - MARGIN, 136),
        tr(f"{roman} триместр · {year}", f"Trimester {roman} · {year}", f"{roman} триместр · {year}"),
        font=_font("regular", 26),
        fill=(225, 235, 248),
        anchor="ra",
    )

    # --- topic & discipline
    y = header_h + 60
    d.text((MARGIN, y), tr("ТЕМА", "TOPIC", "ТАҚЫРЫБЫ"), font=_font("bold", 24), fill=accent)
    y += 40
    for line in _wrap(d, lesson.topic, _font("bold", 58), W - 2 * MARGIN, 3):
        d.text((MARGIN, y), line, font=_font("bold", 58), fill=INK)
        y += 70
    y += 14
    discipline = tr(f"Дисциплина: {lesson.discipline}", f"Discipline: {lesson.discipline}", f"Пән: {lesson.discipline}")
    for line in _wrap(d, discipline, _font("regular", 32), W - 2 * MARGIN, 1):
        d.text((MARGIN, y), line, font=_font("regular", 32), fill=MUTED)
    y += 70

    # --- teacher
    d.line((MARGIN, y, W - MARGIN, y), fill=(229, 231, 235), width=3)
    y += 40
    d.text((MARGIN, y), _wrap(d, lesson.teacher.full_name, _font("bold", 44), W - 2 * MARGIN, 1)[0], font=_font("bold", 44), fill=INK)
    y += 60
    school_obj = lesson.department.school if lesson.department else None
    school = pick(school_obj.name, school_obj.name_en, school_obj.name_kz) if school_obj else ""
    position = ", ".join(p for p in [lesson.teacher_position or lesson.teacher.position, school] if p)
    for line in _wrap(d, position, _font("regular", 30), W - 2 * MARGIN, 2):
        d.text((MARGIN, y), line, font=_font("regular", 30), fill=MUTED)
        y += 40
    y += 40

    # --- date / time / place
    rows = [
        ("calendar", tr("Дата", "Date", "Күні"), fmt_date(lesson.date)),
        ("clock", tr("Время", "Time", "Уақыты"), fmt_range(lesson.start_time, lesson.end_time)),
        ("pin", tr("Место", "Location", "Орны"), lesson.place),
    ]
    for icon, label, value in rows:
        _icon(d, icon, MARGIN, y, accent)
        d.text((MARGIN + 92, y + 2), label, font=_font("regular", 24), fill=MUTED)
        value = _wrap(d, value, _font("bold", 34), W - 2 * MARGIN - 92, 1)[0] if value else ""
        d.text((MARGIN + 92, y + 30), value, font=_font("bold", 34), fill=INK)
        y += 90

    # --- invitation text (fits into the space left above the footer)
    footer_h = 190
    y += 14
    space = H - footer_h - 40 - y
    max_lines = max(1, min(4, (space - 44) // 40))
    box_lines = _wrap(d, invitation, _font("regular", 28), W - 2 * MARGIN - 60, max_lines)
    box_h = 44 + len(box_lines) * 40
    d.rounded_rectangle((MARGIN, y, W - MARGIN, y + box_h), 28, fill=(241, 245, 251))
    d.rectangle((MARGIN, y + 22, MARGIN + 8, y + box_h - 22), fill=accent)
    ty = y + 22
    for line in box_lines:
        d.text((MARGIN + 36, ty), line, font=_font("regular", 28), fill=INK)
        ty += 40

    # --- footer with QR to the lesson card
    d.rectangle((0, H - footer_h, W, H), fill=primary)
    qr = qrcode.QRCode(border=1, box_size=6)
    qr.add_data(f"{settings.frontend_url.rstrip('/')}/lessons/{lesson.id}")
    qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGBA").resize((146, 146))
    img.alpha_composite(qr_img, (W - MARGIN - 146, H - footer_h + 22))
    footer_w = W - 2 * MARGIN - 146 - 30  # up to the QR code
    university = cfg.get("university_name") or "Astana IT University"
    d.text((MARGIN, H - footer_h + 46), _wrap(d, university, _font("bold", 34), footer_w, 1)[0],
           font=_font("bold", 34), fill=(255, 255, 255))
    footer_note = tr(
        "Подробности и материалы — в карточке занятия на платформе OpenLesson",
        "Details and materials are in the lesson card on the OpenLesson platform",
        "Толығырақ — OpenLesson платформасындағы сабақ картасында",
    )
    d.text(
        (MARGIN, H - footer_h + 96),
        _wrap(d, footer_note, _font("regular", 24), footer_w, 1)[0],
        font=_font("regular", 24),
        fill=(205, 218, 238),
    )
    return img.convert("RGB")


def generate(db: Session, lesson: OpenLesson) -> tuple[str, str]:
    cfg = app_settings.get_all(db)
    with use_lang(cfg.get("poster_language") or "ru"):
        invitation = lesson.invitation_text or tr(
            "Приглашаем преподавателей на открытое занятие! Будем рады видеть вас и обменяться опытом.",
            "We invite the faculty to an open lesson! We look forward to seeing you and sharing experience.",
            "Оқытушыларды ашық сабаққа шақырамыз! Сіздерді көріп, тәжірибе алмасуға қуанышты боламыз.",
        )
        image = render(lesson, cfg, invitation)
    folder = storage.subdir("posters")
    stamp = clock.now().strftime("%Y%m%d%H%M%S")
    png_name, pdf_name = f"lesson_{lesson.id}_{stamp}.png", f"lesson_{lesson.id}_{stamp}.pdf"
    image.save(folder / png_name, "PNG", optimize=True)
    image.save(folder / pdf_name, "PDF", resolution=150)
    for old in (lesson.poster_png, lesson.poster_pdf):
        if old and Path(old).name not in (png_name, pdf_name):
            storage.remove(old)
    lesson.poster_png, lesson.poster_pdf = f"posters/{png_name}", f"posters/{pdf_name}"
    lesson.poster_generated_at = clock.now()
    db.commit()
    return lesson.poster_png, lesson.poster_pdf
