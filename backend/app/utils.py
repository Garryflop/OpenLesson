from datetime import date, datetime, time

from app.i18n import get_lang

MONTHS_GEN = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]
MONTHS_EN = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
WEEKDAYS_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTHS_KK = [
    "қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым",
    "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан",
]
WEEKDAYS_KK = ["дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі", "жексенбі"]


def fmt_date(d: date | datetime, with_year: bool = True) -> str:
    if get_lang() == "kk":  # «2026 жылғы 14 қазан»
        return f"{d.year} жылғы {d.day} {MONTHS_KK[d.month - 1]}" if with_year else f"{d.day} {MONTHS_KK[d.month - 1]}"
    if get_lang() == "en":
        s = f"{d.day} {MONTHS_EN[d.month - 1]}"
        return f"{s} {d.year}" if with_year else s
    s = f"{d.day} {MONTHS_GEN[d.month - 1]}"
    return f"{s} {d.year} года" if with_year else s


def fmt_time(t: time | datetime) -> str:
    return t.strftime("%H:%M")


def fmt_dt(dt: datetime) -> str:
    return f"{fmt_date(dt)}, {fmt_time(dt)}"


def fmt_range(start: time, end: time) -> str:
    return f"{fmt_time(start)}–{fmt_time(end)}"


def weekday(d: date) -> str:
    return {"en": WEEKDAYS_EN, "kk": WEEKDAYS_KK}.get(get_lang(), WEEKDAYS)[d.weekday()]


def short_name(full_name: str) -> str:
    """«Ахметова Айгерим Сериковна» → «А. С. Ахметова»."""
    parts = full_name.split()
    if len(parts) < 2:
        return full_name
    initials = " ".join(f"{p[0]}." for p in parts[1:3])
    return f"{initials} {parts[0]}"


def greeting(full_name: str) -> str:
    """Нейтральное деловое обращение по имени и отчеству (EN: имя и фамилия)."""
    parts = full_name.split()
    if get_lang() == "kk":
        return f"Құрметті {' '.join(parts[1:3])}!" if len(parts) >= 2 else f"Құрметті {full_name}!"
    if get_lang() == "en":
        return f"Hello, {parts[1]} {parts[0]}!" if len(parts) >= 2 else f"Hello, {full_name}!"
    if len(parts) >= 3:
        return f"Здравствуйте, {parts[1]} {parts[2]}!"
    if len(parts) == 2:
        return f"Здравствуйте, {parts[1]} {parts[0]}!"
    return f"Здравствуйте, {full_name}!"


def normalize_name(name: str) -> str:
    return " ".join(name.replace("ё", "е").replace("Ё", "Е").lower().split())


def plural(n: int, one: str, few: str, many: str) -> str:
    n100 = abs(n) % 100
    n10 = n100 % 10
    if 10 < n100 < 20:
        return many
    if n10 == 1:
        return one
    if 2 <= n10 <= 4:
        return few
    return many


def count(n: int, ru: tuple[str, str, str], en: tuple[str, str], kk: str | None = None) -> str:
    """'3 дня' / '3 days' / '3 күн' for the current language (Kazakh nouns stay singular after numbers)."""
    if get_lang() == "kk" and kk:
        return f"{n} {kk}"
    if get_lang() == "en":
        return f"{n} {en[0] if n == 1 else en[1]}"
    return f"{n} {plural(n, *ru)}"
