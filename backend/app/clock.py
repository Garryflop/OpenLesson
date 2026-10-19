"""Single source of "current time" for the whole platform.

All timestamps are stored as naive datetimes in university local time
(``settings.timezone``). A demo offset lets the administrator "fast-forward"
the platform on a non-production instance to show the automatic cycle
(reminders, annulment, posters, feedback) during a presentation.
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import settings

_offset = timedelta(0)


def set_offset(minutes: int) -> None:
    global _offset
    _offset = timedelta(minutes=minutes) if not settings.is_production else timedelta(0)


def get_offset_minutes() -> int:
    return int(_offset.total_seconds() // 60)


def real_now() -> datetime:
    return datetime.now(ZoneInfo(settings.timezone)).replace(tzinfo=None, microsecond=0)


def now() -> datetime:
    return real_now() + _offset
