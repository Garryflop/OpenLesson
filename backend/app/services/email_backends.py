"""Delivery of e-mails through the university mail service.

* ``console`` – development: the letter is written to ``storage/outbox`` and logged.
* ``smtp``    – any SMTP server (e.g. ``smtp.office365.com:587`` with STARTTLS).
* ``graph``   – Microsoft Graph ``sendMail`` with an Entra ID app registration
                (application permission ``Mail.Send``). Recommended for Outlook /
                Exchange Online, where SMTP basic authentication is being retired.
"""

import base64
import logging
import mimetypes
import smtplib
import time
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr
from pathlib import Path

import httpx

from app.config import settings
from app.i18n import tr
from app.models import EmailMessage

log = logging.getLogger("openlesson.email")


class DeliveryError(Exception):
    pass


def _attachment_paths(msg: EmailMessage) -> list[tuple[Path, str, str]]:
    result = []
    for a in msg.attachments or []:
        path = settings.storage_dir / a["path"]
        if not path.exists():
            missing = a["path"]
            raise DeliveryError(tr(f"Вложение не найдено: {missing}", f"Attachment not found: {missing}", f"Тіркеме табылмады: {missing}"))
        mime = a.get("mime") or mimetypes.guess_type(a["name"])[0] or "application/octet-stream"
        result.append((path, a["name"], mime))
    return result


class ConsoleBackend:
    def send(self, msg: EmailMessage) -> None:
        outbox = settings.storage_dir / "outbox"
        outbox.mkdir(parents=True, exist_ok=True)
        (outbox / f"{msg.id:06d}.html").write_text(
            f"<!-- To: {msg.to_email} | Subject: {msg.subject} -->\n{msg.html}", encoding="utf-8"
        )
        _attachment_paths(msg)  # validate attachments exist
        log.info("[console email] to=%s subject=%s", msg.to_email, msg.subject)


class SmtpBackend:
    def send(self, msg: EmailMessage) -> None:
        mime = MimeMessage()
        mime["Subject"] = msg.subject
        mime["From"] = formataddr((settings.email_from_name, settings.email_from))
        mime["To"] = msg.to_email
        mime.set_content(msg.text or tr("Откройте письмо в HTML-формате.", "Please open this e-mail in HTML format.",
                                        "Хатты HTML форматында ашыңыз."))
        mime.add_alternative(msg.html, subtype="html")
        for path, name, mimetype in _attachment_paths(msg):
            maintype, subtype = mimetype.split("/", 1)
            mime.add_attachment(path.read_bytes(), maintype=maintype, subtype=subtype, filename=name)
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
                if settings.smtp_starttls:
                    smtp.starttls()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(mime)
        except (smtplib.SMTPException, OSError) as exc:
            raise DeliveryError(f"SMTP: {exc}") from exc


class GraphBackend:
    _token: str | None = None
    _token_exp: float = 0

    def _get_token(self) -> str:
        if self._token and time.time() < self._token_exp - 60:
            return self._token
        url = f"https://login.microsoftonline.com/{settings.graph_tenant_id}/oauth2/v2.0/token"
        resp = httpx.post(
            url,
            data={
                "client_id": settings.graph_client_id,
                "client_secret": settings.graph_client_secret,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            },
            timeout=30,
        )
        if resp.status_code != 200:
            raise DeliveryError(f"Graph token: {resp.status_code} {resp.text[:300]}")
        data = resp.json()
        GraphBackend._token = data["access_token"]
        GraphBackend._token_exp = time.time() + int(data.get("expires_in", 3600))
        return GraphBackend._token

    def send(self, msg: EmailMessage) -> None:
        attachments = [
            {
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": name,
                "contentType": mimetype,
                "contentBytes": base64.b64encode(path.read_bytes()).decode(),
            }
            for path, name, mimetype in _attachment_paths(msg)
        ]
        payload = {
            "message": {
                "subject": msg.subject,
                "body": {"contentType": "HTML", "content": msg.html},
                "toRecipients": [{"emailAddress": {"address": msg.to_email}}],
                "attachments": attachments,
            },
            "saveToSentItems": False,
        }
        sender = settings.graph_sender or settings.email_from
        try:
            resp = httpx.post(
                f"https://graph.microsoft.com/v1.0/users/{sender}/sendMail",
                json=payload,
                headers={"Authorization": f"Bearer {self._get_token()}"},
                timeout=60,
            )
        except httpx.HTTPError as exc:
            raise DeliveryError(f"Graph: {exc}") from exc
        if resp.status_code not in (200, 202):
            raise DeliveryError(f"Graph sendMail: {resp.status_code} {resp.text[:300]}")


def get_backend():
    return {"smtp": SmtpBackend, "graph": GraphBackend}.get(settings.email_backend, ConsoleBackend)()
