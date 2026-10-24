from datetime import timedelta

from conftest import World, docx_bytes, travel_to
from sqlalchemy import select

from app import clock
from app.models import AIAnalysis, EmailMessage, Feedback, Notification
from app.services import app_settings, automation


def _kinds(db, user=None) -> list[str]:
    stmt = select(Notification)
    if user:
        stmt = stmt.where(Notification.user_id == user.id)
    return [n.kind for n in db.scalars(stmt).all()]


def upload_both(client, lesson, user):
    h = World.auth(user)
    r = client.post(f"/api/lessons/{lesson.id}/materials/presentation", headers=h,
                    files={"file": ("Презентация.pptx", b"PK fake pptx", "application/octet-stream")})
    assert r.status_code == 200, r.text
    r = client.post(f"/api/lessons/{lesson.id}/materials/plan", headers=h,
                    files={"file": ("План.docx", docx_bytes(), "application/octet-stream")})
    assert r.status_code == 200, r.text


def test_full_cycle(client, db, world):
    lesson = world.lesson(days_ahead=14)
    assert lesson.status == "scheduled"
    assert "lesson_scheduled" in _kinds(db, world.teacher)

    # 10 days before: preliminary reminder (materials missing)
    travel_to(lesson.start_dt - timedelta(days=10))
    automation.run_cycle(db)
    assert "pre_reminder" in _kinds(db, world.teacher)

    upload_both(client, lesson, world.teacher)
    db.refresh(lesson)
    assert lesson.status == "materials_ready"
    assert db.scalar(select(AIAnalysis).where(AIAnalysis.kind == "plan")) is not None  # background AI analysis

    # 7 days before: reminder; after the deadline: confirmation
    travel_to(lesson.materials_deadline + timedelta(minutes=1))
    automation.run_cycle(db)
    db.refresh(lesson)
    assert lesson.status == "confirmed"
    assert _kinds(db, world.teacher).count("reminder") == 1

    # 3 days before: poster generated and mailed to all faculty
    travel_to(lesson.start_dt - timedelta(days=3))
    report = automation.run_cycle(db)
    db.refresh(lesson)
    assert report["posters"] == [lesson.id]
    assert lesson.poster_png and lesson.poster_pdf and lesson.poster_sent_at
    poster_mails = db.scalars(select(EmailMessage).where(EmailMessage.kind == "poster")).all()
    assert {m.to_email for m in poster_mails} == {u.email for u in (world.teacher, world.obs1, world.obs2)}
    assert all(m.status == "sent" and m.attachments for m in poster_mails)
    automation.run_cycle(db)  # idempotent
    assert len(db.scalars(select(EmailMessage).where(EmailMessage.kind == "poster")).all()) == 3

    # after the lesson: completed; the methodologist enters both attendees from the attendance sheet
    travel_to(lesson.end_dt + timedelta(minutes=5))
    automation.run_cycle(db)
    db.refresh(lesson)
    assert lesson.status == "completed"
    assert "register_attendance" in _kinds(db, world.admin)
    admin = World.auth(world.admin)
    r = client.post(f"/api/lessons/{lesson.id}/attendance", headers=admin, json={"user_ids": [world.obs1.id, world.obs2.id]})
    assert r.status_code == 200 and len(r.json()["added"]) == 2
    r = client.post(f"/api/lessons/{lesson.id}/attendance/confirm", headers=admin, json={})
    assert r.status_code == 200, r.text
    db.expire_all()
    assert lesson.status == "feedback"
    fbs = db.scalars(select(Feedback).where(Feedback.lesson_id == lesson.id)).all()
    assert {f.author_id for f in fbs} == {world.obs1.id, world.obs2.id}

    # obs1 submits; obs2 ignores and gets reminders
    fb1 = next(f for f in fbs if f.author_id == world.obs1.id)
    scores = {str(c.id): 5 for c in world.criteria}
    r = client.post(f"/api/feedback/{fb1.id}/submit", headers=World.auth(world.obs1),
                    json={"scores": scores, "strengths": "Отличная структура", "improvements": "Больше времени на вопросы"})
    assert r.status_code == 200, r.text
    r = client.post(f"/api/feedback/{fb1.id}/submit", headers=World.auth(world.obs1), json={"scores": scores, "strengths": "x"})
    assert r.status_code == 409  # no double submission

    fb2 = next(f for f in fbs if f.author_id == world.obs2.id)
    travel_to(fb2.opened_at + timedelta(days=1, minutes=1))
    automation.run_cycle(db)
    travel_to(fb2.opened_at + timedelta(days=2, minutes=1))
    automation.run_cycle(db)
    db.refresh(fb2)
    assert fb2.reminders_sent == 2

    # teacher sees feedback, can reply but cannot edit
    teacher = World.auth(world.teacher)
    r = client.get(f"/api/lessons/{lesson.id}/feedback", headers=teacher)
    assert r.status_code == 200 and len(r.json()["items"]) == 1
    assert r.json()["items"][0]["author"]["full_name"] == world.obs1.full_name
    assert client.put(f"/api/feedback/{fb1.id}", headers=teacher, json={"scores": scores}).status_code == 403
    assert client.post(f"/api/feedback/{fb1.id}/replies", headers=teacher, json={"text": "Спасибо!"}).status_code == 201
    assert client.post(f"/api/feedback/{fb1.id}/replies", headers=World.auth(world.obs2), json={"text": "x"}).status_code == 403

    # 3 days after: window closes, results + AI summary
    db.refresh(lesson)
    travel_to(lesson.feedback_due_at + timedelta(minutes=1))
    automation.run_cycle(db)
    db.refresh(lesson)
    db.refresh(fb2)
    assert lesson.status == "closed"
    assert fb2.status == "expired"
    assert db.scalar(select(AIAnalysis).where(AIAnalysis.kind == "feedback")) is not None
    assert "feedback_results" in _kinds(db, world.teacher)
    assert "feedback_missing" in _kinds(db, world.admin)

    r = client.get(f"/api/lessons/{lesson.id}/feedback/pdf", headers=teacher)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_auto_annulment_notifies_responsible(db, world):
    lesson = world.lesson(days_ahead=12)
    travel_to(lesson.materials_deadline + timedelta(minutes=1))
    report = automation.run_cycle(db)
    db.refresh(lesson)
    assert lesson.status == "annulled" and report["annulled"] == [lesson.id]
    assert "Не загружены обязательные материалы" in lesson.annul_reason
    assert "lesson_annulled" in _kinds(db, world.teacher)
    assert "lesson_annulled_admin" in _kinds(db, world.admin)
    assert "lesson_annulled_admin" in _kinds(db, world.dean)
    travel_to(lesson.start_dt - timedelta(days=2))
    automation.run_cycle(db)
    db.refresh(lesson)
    assert lesson.poster_png is None  # poster publication cancelled


def test_admin_confirm_policy_and_restore(client, db, world):
    app_settings.set_many(db, {"annul_policy": "admin_confirm"})
    lesson = world.lesson(days_ahead=12)
    travel_to(lesson.materials_deadline + timedelta(minutes=1))
    automation.run_cycle(db)
    db.refresh(lesson)
    assert lesson.status == "violation"
    until = (clock.now() + timedelta(days=2)).isoformat()
    r = client.post(f"/api/lessons/{lesson.id}/extend", headers=World.auth(world.admin),
                    json={"until": until, "reason": "Уважительная причина"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "scheduled"


def test_grace_policy(db, world):
    app_settings.set_many(db, {"annul_policy": "grace", "grace_hours": 24})
    lesson = world.lesson(days_ahead=12)
    travel_to(lesson.materials_deadline + timedelta(minutes=1))
    automation.run_cycle(db)
    db.refresh(lesson)
    assert lesson.status == "scheduled" and lesson.extended_deadline is not None
    travel_to(lesson.extended_deadline + timedelta(minutes=1))
    automation.run_cycle(db)
    db.refresh(lesson)
    assert lesson.status == "annulled"


def test_attendance_rules(client, db, world):
    lesson = world.lesson(days_ahead=0, approve=False)
    lesson.status = "completed"
    db.commit()
    admin = World.auth(world.admin)
    r = client.post(f"/api/lessons/{lesson.id}/attendance", headers=admin, json={"user_ids": [world.obs1.id, world.teacher.id]})
    body = r.json()
    assert len(body["added"]) == 1 and len(body["skipped"]) == 1  # teacher can't be own visitor
    r = client.post(f"/api/lessons/{lesson.id}/attendance", headers=admin, json={"user_ids": [world.obs1.id]})
    assert r.json()["skipped"][0]["reason"].endswith("уже зарегистрирован(а) на это занятие")
    assert client.post(f"/api/lessons/{lesson.id}/attendance", headers=World.auth(world.obs2),
                       json={"user_ids": [world.obs2.id]}).status_code == 403


def test_qr_checkin_is_optional(client, db, world):
    lesson = world.lesson(days_ahead=12)
    # off by default (spec 7.2: additional function) — the attendance sheet is the main way
    r = client.post(f"/api/checkin/{lesson.qr_token}", headers=World.auth(world.obs1))
    assert r.status_code == 404
    assert client.get(f"/api/lessons/{lesson.id}", headers=World.auth(world.admin)).json()["qr_token"] is None
    app_settings.set_many(db, {"qr_checkin_enabled": True})
    r = client.post(f"/api/checkin/{lesson.qr_token}", headers=World.auth(world.obs1))
    assert r.status_code == 400  # window not open before the lesson day
    travel_to(lesson.start_dt - timedelta(minutes=10))
    automation.run_cycle(db)
    db.refresh(lesson)
    upload_both(client, lesson, world.teacher) if lesson.status == "scheduled" else None
    lesson.status = "confirmed"
    db.commit()
    r = client.post(f"/api/checkin/{lesson.qr_token}", headers=World.auth(world.obs1))
    assert r.status_code == 200, r.text
    assert r.json()["attendance"]["status"] == "pending"


def test_english_messages_and_notifications(client, db, world):
    lesson = world.lesson(days_ahead=0, approve=False)
    lesson.status = "completed"
    db.commit()
    admin = {**World.auth(world.admin), "X-Lang": "en"}
    r = client.post(f"/api/lessons/{lesson.id}/attendance", headers=admin, json={"user_ids": [world.obs1.id, world.teacher.id]})
    assert r.json()["skipped"][0]["reason"] == "The teacher giving the lesson cannot be an attendee"
    client.post(f"/api/lessons/{lesson.id}/attendance/confirm", headers=admin, json={})
    # stored in both languages, shown in the language of the request
    obs = World.auth(world.obs1)
    ru = client.get("/api/notifications", headers={**obs, "X-Lang": "ru"}).json()["items"][0]
    en = client.get("/api/notifications", headers={**obs, "X-Lang": "en"}).json()["items"][0]
    assert ru["title"] == "Заполните форму обратной связи"
    assert en["title"] == "Please fill in the feedback form"
    events = client.get(f"/api/lessons/{lesson.id}", headers=admin).json()["events"]
    assert any(e["message"].startswith("Attendee list confirmed") for e in events)
    # e-mail follows the recipient's language
    world.obs2.language = "en"
    db.commit()
    assert client.put("/api/auth/me/language", headers=obs, json={"language": "en"}).json()["language"] == "en"


def test_kazakh_messages_and_notifications(client, db, world):
    lesson = world.lesson(days_ahead=0, approve=False)
    lesson.status = "completed"
    db.commit()
    admin = {**World.auth(world.admin), "X-Lang": "kk"}
    r = client.post(f"/api/lessons/{lesson.id}/attendance", headers=admin, json={"user_ids": [world.obs1.id, world.teacher.id]})
    assert r.json()["skipped"][0]["reason"] == "Сабақты өткізетін оқытушы қатысушы бола алмайды"
    client.post(f"/api/lessons/{lesson.id}/attendance/confirm", headers=admin, json={})
    # stored in every language, shown in the language of the request
    obs = World.auth(world.obs1)
    kk = client.get("/api/notifications", headers={**obs, "X-Lang": "kk"}).json()["items"][0]
    ru = client.get("/api/notifications", headers={**obs, "X-Lang": "ru"}).json()["items"][0]
    assert kk["title"] == "Кері байланыс формасын толтырыңыз"
    assert ru["title"] == "Заполните форму обратной связи"
    events = client.get(f"/api/lessons/{lesson.id}", headers=admin).json()["events"]
    assert any(e["message"].startswith("Қатысушылар тізімі расталды (1 оқытушы)") for e in events)
    assert any(e["message"].startswith("Қатысу парағы бойынша қатысушылар енгізілді") for e in events)
    assert client.put("/api/auth/me/language", headers=obs, json={"language": "kk"}).json()["language"] == "kk"


def test_permissions_and_drafts(client, world):
    draft = world.lesson(days_ahead=20, approve=False)
    teacher = World.auth(world.teacher)
    assert client.get(f"/api/lessons/{draft.id}", headers=teacher).status_code == 404
    assert client.get(f"/api/lessons/{draft.id}", headers=World.auth(world.admin)).status_code == 200
    assert client.get("/api/settings", headers=teacher).status_code == 403
    assert client.get("/api/analytics", headers=teacher).status_code == 403
    assert client.get("/api/analytics", headers=World.auth(world.dean)).status_code == 200
    assert client.get("/api/lessons").status_code == 401


def test_feedback_only_for_registered_visitors(client, db, world):
    lesson = world.lesson(days_ahead=0, approve=False)
    lesson.status = "completed"
    db.commit()
    admin = World.auth(world.admin)
    client.post(f"/api/lessons/{lesson.id}/attendance", headers=admin, json={"user_ids": [world.obs1.id]})
    client.post(f"/api/lessons/{lesson.id}/attendance/confirm", headers=admin, json={})
    fb = db.scalar(select(Feedback))
    assert client.get(f"/api/feedback/{fb.id}", headers=World.auth(world.obs2)).status_code == 403
    r = client.get(f"/api/feedback/{fb.id}", headers=World.auth(world.obs1))
    assert r.status_code == 200 and r.json()["editable"] is True
    # draft keeps data, incomplete submit is rejected
    r = client.put(f"/api/feedback/{fb.id}", headers=World.auth(world.obs1),
                   json={"scores": {str(world.criteria[0].id): 4}, "strengths": "Черновик"})
    assert r.status_code == 200 and r.json()["status"] == "draft"
    r = client.post(f"/api/feedback/{fb.id}/submit", headers=World.auth(world.obs1),
                    json={"scores": {str(world.criteria[0].id): 4}, "strengths": "Черновик"})
    assert r.status_code == 400
