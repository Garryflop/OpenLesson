"""Locate TTF fonts with Cyrillic support for posters and PDF reports."""

from functools import lru_cache
from pathlib import Path

from app.config import settings

_CANDIDATES = {
    "regular": [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ],
    "bold": [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/arialbd.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    ],
    "black": [
        "C:/Windows/Fonts/segoeuib.ttf",
        "C:/Windows/Fonts/ariblk.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ],
}


@lru_cache
def font_path(weight: str = "regular") -> str | None:
    override = settings.font_bold if weight in ("bold", "black") else settings.font_regular
    for candidate in ([override] if override else []) + _CANDIDATES[weight]:
        if candidate and Path(candidate).exists():
            return candidate
    if weight != "regular":
        return font_path("regular")
    return None
