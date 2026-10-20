from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app import clock
from app.db import get_db
from app.deps import get_current_user
from app.models import Notification, User
from app.serializers import notification_out

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
def list_notifications(
    unread_only: bool = False, limit: int = 50, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    items = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(min(limit, 200))).all()
    unread = db.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return {"unread": unread, "items": [notification_out(n) for n in items]}


@router.post("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404)
    n.read_at = n.read_at or clock.now()
    db.commit()
    return notification_out(n)


@router.post("/read-all")
def mark_all(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=clock.now())
    )
    db.commit()
    return {"ok": True}
