"""Interface language (KK / RU / EN) for API messages and generated texts.

The language of a request comes from the ``X-Lang`` header sent by the frontend (falls back to
``Accept-Language``) and lives in a context variable, so services can call :func:`tr` without
passing the language around. Texts that are stored and shown later (notifications, lesson history)
are generated in every language with :func:`both`; e-mails are rendered in the recipient's language.

Kazakh falls back to Russian where a text has no Kazakh version yet.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import TypeVar

LANGS = ("ru", "kk", "en")
DEFAULT_LANG = "ru"
_ALIASES = {"kz": "kk", "qq": "kk"}

_lang: ContextVar[str] = ContextVar("lang", default=DEFAULT_LANG)
T = TypeVar("T")


def normalize(value: str | None) -> str:
    """'en-GB,en;q=0.9' → 'en'; 'kk-KZ' / 'kz' → 'kk'; anything unknown → default language."""
    for part in (value or "").split(","):
        code = part.split(";")[0].strip().lower()[:2]
        code = _ALIASES.get(code, code)
        if code in LANGS:
            return code
    return DEFAULT_LANG


def get_lang() -> str:
    return _lang.get()


def set_lang(lang: str) -> Token:
    return _lang.set(lang if lang in LANGS else DEFAULT_LANG)


def reset_lang(token: Token) -> None:
    _lang.reset(token)


@contextmanager
def use_lang(lang: str | None) -> Iterator[None]:
    token = set_lang(lang or DEFAULT_LANG)
    try:
        yield
    finally:
        _lang.reset(token)


def tr(ru: str, en: str, kk: str | None = None) -> str:
    """Pick the text for the current language (Kazakh falls back to Russian)."""
    lang = _lang.get()
    if lang == "en":
        return en
    if lang == "kk" and kk:
        return kk
    return ru


def both(build: Callable[[], T]) -> dict[str, T]:
    """Build a value once per language: {'ru': ..., 'kk': ..., 'en': ...} (name kept for compatibility)."""
    out: dict[str, T] = {}
    for lang in LANGS:
        with use_lang(lang):
            out[lang] = build()
    return out


all_langs = both


def pick(ru: str | None, en: str | None, kk: str | None = None) -> str | None:
    """Stored multilingual value → text for the current language (falls back to Russian)."""
    lang = _lang.get()
    if lang == "en" and en:
        return en
    if lang == "kk" and kk:
        return kk
    return ru
