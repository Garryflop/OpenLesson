import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.db import SessionLocal
from app.services import app_settings, automation, notify

log = logging.getLogger("openlesson.scheduler")
_scheduler: BackgroundScheduler | None = None


def _cycle_job() -> None:
    with SessionLocal() as db:
        app_settings.load_clock(db)
        report = automation.run_cycle(db)
        actions = {k: v for k, v in report.items() if isinstance(v, list) and v}
        if actions:
            log.info("Automation cycle: %s", actions)


def _outbox_job() -> None:
    with SessionLocal() as db:
        app_settings.load_clock(db)
        notify.process_outbox(db)


def start() -> None:
    global _scheduler
    if _scheduler or not settings.scheduler_enabled:
        return
    _scheduler = BackgroundScheduler(timezone=settings.timezone)
    _scheduler.add_job(_cycle_job, "interval", minutes=settings.scheduler_interval_minutes, id="cycle",
                       max_instances=1, coalesce=True)
    _scheduler.add_job(_outbox_job, "interval", minutes=1, id="outbox", max_instances=1, coalesce=True)
    _scheduler.start()
    log.info("Scheduler started (cycle every %s min)", settings.scheduler_interval_minutes)


def shutdown() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
