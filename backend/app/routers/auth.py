"""Authentication: OpenID Connect (Microsoft Entra ID / Outlook) + demo sign-in."""

import logging
from urllib.parse import quote

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import clock
from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.i18n import LANGS, tr
from app.models import Role, User
from app.schemas import DevLoginIn, LanguageIn
from app.security import COOKIE_NAME, create_session_token
from app.serializers import user_out
from app.utils import normalize_name

log = logging.getLogger("openlesson.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])

oauth = OAuth()
if settings.oidc_enabled:
    oauth.register(
        name="oidc",
        client_id=settings.oidc_client_id,
        client_secret=settings.oidc_client_secret or None,
        server_metadata_url=settings.oidc_discovery_url,
        client_kwargs={"scope": settings.oidc_scopes, "code_challenge_method": "S256"},
    )


def _set_session(response: Response, user: User) -> None:
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user.id),
        max_age=settings.session_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def _frontend(path: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}{path}"


@router.get("/config")
def auth_config():
    return {
        "oidc_enabled": settings.oidc_enabled,
        "provider_name": settings.oidc_provider_name,
        "dev_login_enabled": settings.dev_login_enabled,
        "allowed_domains": settings.allowed_domains,
    }


@router.get("/login")
async def login(request: Request, next: str = "/"):
    if not settings.oidc_enabled:
        raise HTTPException(503, tr(
            "Вход через OpenID Connect не настроен (OIDC_CLIENT_ID, OIDC_DISCOVERY_URL)",
            "OpenID Connect sign-in is not configured (OIDC_CLIENT_ID, OIDC_DISCOVERY_URL)",
            "OpenID Connect арқылы кіру бапталмаған (OIDC_CLIENT_ID, OIDC_DISCOVERY_URL)",
        ))
    request.session["next"] = next if next.startswith("/") else "/"
    return await oauth.oidc.authorize_redirect(request, settings.oidc_redirect_uri)


@router.get("/callback")
async def callback(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.oidc.authorize_access_token(request)
    except OAuthError as exc:
        log.warning("OIDC error: %s", exc)
        return RedirectResponse(_frontend(f"/login?error={quote(exc.description or exc.error or 'oidc')}"))
    claims = token.get("userinfo") or {}
    email = (claims.get("email") or claims.get("preferred_username") or claims.get("upn") or "").lower().strip()
    if not email or "@" not in email:
        return RedirectResponse(_frontend("/login?error=" + quote(tr(
            "Провайдер не передал e-mail пользователя", "The identity provider did not return an e-mail address",
            "Сәйкестендіру провайдері пайдаланушының e-mail мекенжайын бермеді",
        ))))
    domain = email.split("@", 1)[1]
    if settings.allowed_domains and domain not in settings.allowed_domains:
        return RedirectResponse(_frontend("/login?error=" + quote(tr(
            f"Домен {domain} не допускается", f"The domain {domain} is not allowed", f"{domain} доменіне рұқсат етілмейді"
        ))))

    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        user = _match_directory_by_name(db, claims)
        if user is not None:
            user.email = email  # first sign-in links the directory record to the Microsoft account
    if user is None:
        if not settings.auto_create_users:
            return RedirectResponse(_frontend("/login?error=" + quote(tr(
                "Пользователь не найден в справочнике ППС", "The user is not in the staff directory",
                "Пайдаланушы ПОҚ анықтамалығында табылмады",
            ))))
        roles = [Role.teacher.value]
        if email in settings.admin_email_list:
            roles.append(Role.admin.value)
        user = User(email=email, full_name=claims.get("name") or email.split("@")[0], roles=roles)
        db.add(user)
    if not user.is_active:
        return RedirectResponse(_frontend("/login?error=" + quote(tr("Учётная запись отключена", "The account is disabled", "Есептік жазба өшірілген"))))
    user.oidc_subject = claims.get("sub") or user.oidc_subject
    user.last_login_at = clock.now()
    db.commit()

    response = RedirectResponse(_frontend(request.session.pop("next", "/")))
    _set_session(response, user)
    return response


def _match_directory_by_name(db: Session, claims: dict) -> User | None:
    """Link a directory record (imported without e-mail) by the unique full name from the ID token."""
    variants = {normalize_name(claims.get("name") or "")}
    given, family = claims.get("given_name") or "", claims.get("family_name") or ""
    if given and family:
        variants |= {normalize_name(f"{family} {given}"), normalize_name(f"{given} {family}")}
    variants.discard("")
    if not variants:
        return None
    candidates = [
        u for u in db.scalars(select(User).where(User.email.is_(None))).all()
        if normalize_name(u.full_name) in variants
        or normalize_name(" ".join(u.full_name.split()[:2])) in variants  # without patronymic
    ]
    return candidates[0] if len(candidates) == 1 else None


PRIORITY = ["admin", "methodist", "dean", "leadership", "teacher"]


@router.get("/dev-users")
def dev_users(q: str = "", limit: int = 40, db: Session = Depends(get_db)):
    """Demo sign-in picker: service roles first, then teachers matching the search."""
    if not settings.dev_login_enabled:
        raise HTTPException(404)
    stmt = select(User).where(User.is_active.is_(True))
    if q.strip():
        stmt = stmt.where(func.lower(User.full_name).like(f"%{q.strip().lower()}%"))
    users = db.scalars(stmt.order_by(User.full_name)).all()
    users = sorted(users, key=lambda u: min((PRIORITY.index(r) for r in u.roles if r in PRIORITY), default=9))
    return [user_out(u) for u in users[: min(limit, 100)]]


@router.post("/dev-login")
def dev_login(data: DevLoginIn, response: Response, db: Session = Depends(get_db)):
    if not settings.dev_login_enabled:
        raise HTTPException(404)
    if data.user_id is not None:
        user = db.get(User, data.user_id)
    elif data.email:
        user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    else:
        raise HTTPException(400, tr("Укажите пользователя", "Choose a user", "Пайдаланушыны таңдаңыз"))
    if user is None or not user.is_active:
        raise HTTPException(404, tr("Пользователь не найден", "User not found", "Пайдаланушы табылмады"))
    user.last_login_at = clock.now()
    db.commit()
    _set_session(response, user)
    return user_out(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.put("/me/language")
def set_language(data: LanguageIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Interface language; e-mails and new notifications follow it."""
    if data.language not in LANGS:
        raise HTTPException(400, tr("Неизвестный язык", "Unknown language", "Белгісіз тіл"))
    user.language = data.language
    db.commit()
    return user_out(user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}
