from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.i18n import tr
from app.models import OpenLesson, Role, User
from app.security import COOKIE_NAME, decode_session_token


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        token = auth[7:]
    user_id = decode_session_token(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, tr("Требуется авторизация", "Authentication required", "Жүйеге кіру қажет"))
    return user


def require_roles(*roles: Role):
    def checker(user: User = Depends(get_current_user)) -> User:
        if not user.has_role(*roles):
            raise HTTPException(status.HTTP_403_FORBIDDEN, tr("Недостаточно прав", "Insufficient permissions", "Құқық жеткіліксіз"))
        return user

    return checker


require_manager = require_roles(Role.admin, Role.methodist)
require_admin = require_roles(Role.admin)
require_analytics = require_roles(Role.admin, Role.methodist, Role.dean, Role.leadership)


def can_view_lesson_details(user: User, lesson: OpenLesson) -> bool:
    """Доступ к служебным разделам карточки (материалы, отзывы, посетители)."""
    if user.is_manager or user.has_role(Role.leadership) or lesson.teacher_id == user.id:
        return True
    if user.has_role(Role.dean) and user.managed_school_id:
        dept = lesson.department
        return bool(dept and dept.school_id == user.managed_school_id)
    return False


def ensure(condition: bool, message: str | None = None, code: int = status.HTTP_403_FORBIDDEN) -> None:
    if not condition:
        raise HTTPException(code, message or tr("Недостаточно прав", "Insufficient permissions", "Құқық жеткіліксіз"))
