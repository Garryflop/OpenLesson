import io
from datetime import timedelta

from conftest import World
from openpyxl import Workbook

from app import clock
from app.models import Location


def _schedule_xlsx(rows):
    wb = Workbook()
    ws = wb.active
    ws.append(["Учебный год", "Триместр", "ФИО преподавателя", "Должность", "Кафедра",
               "Тема открытого занятия", "Дисциплина", "Дата", "Время", "Место", "Email"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_schedule_import_and_approval(client, db, world):
    db.add(Location(code="C1.2.243K", map_key="C1.2.243K", block="C1.2", floor=2, room="243K", kind="computer"))
    db.commit()
    d = (clock.now() + timedelta(days=30)).strftime("%d.%m.%Y")
    content = _schedule_xlsx([
        ["2026–2027", "I", world.teacher.full_name, "Старший преподаватель", "Программная инженерия",
         "Интерактивные методы обучения", "Педагогика", d, "10:00–10:50", "Корпус C1, C1.2.243K", ""],
        ["2026–2027", "I", "Новый Преподаватель Иванович", "Преподаватель", "Новая кафедра",
         "Тема 2", "Дисциплина 2", d, "14:00-14:50", "Аудитория 101", "new.teacher@astanait.edu.kz"],
        ["2026–2027", "I", "Неизвестный Без Почты", "Преподаватель", "", "Тема 3", "Дисц 3", d, "9:00-8:00", "", ""],
        ["2026–2027", "II", world.teacher.full_name, "", "", "Тема 4", "Дисц 4", d, "10:00–10:50", "", ""],
    ])
    admin = World.auth(world.admin)
    r = client.post(f"/api/trimesters/{world.trimester.id}/import", headers=admin,
                    files={"file": ("schedule.xlsx", content, "application/octet-stream")})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["created"] == 2
    assert [e["row"] for e in body["errors"]] == [4, 5]

    lessons = client.get("/api/lessons", headers=admin, params={"trimester_id": world.trimester.id}).json()
    assert {l["status"] for l in lessons} == {"draft"}
    assert any(l["location"] and l["location"]["code"] == "C1.2.243K" for l in lessons)
    # teachers don't see the unapproved schedule
    assert client.get("/api/lessons", headers=World.auth(world.teacher)).json() == []

    r = client.post(f"/api/trimesters/{world.trimester.id}/approve", headers=admin)
    assert r.status_code == 200 and r.json()["approved"] == 2
    statuses = {l["status"] for l in client.get("/api/lessons", headers=World.auth(world.teacher)).json()}
    assert statuses == {"scheduled"}


def test_template_and_reports(client, world):
    admin = World.auth(world.admin)
    r = client.get("/api/schedule/template", headers=admin)
    assert r.status_code == 200 and r.content[:2] == b"PK"
    world.lesson(days_ahead=10)
    data = client.get("/api/analytics", headers=admin).json()
    assert data["summary"]["total"] == 1
    r = client.get("/api/reports/export", headers=admin, params={"format": "xlsx"})
    assert r.status_code == 200 and r.content[:2] == b"PK"
    r = client.get("/api/reports/export", headers=admin, params={"format": "pdf"})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_dev_login_and_me(client, world):
    r = client.post("/api/auth/dev-login", json={"email": world.teacher.email})
    assert r.status_code == 200
    me = client.get("/api/auth/me")
    assert me.status_code == 200 and me.json()["email"] == world.teacher.email
    assert client.get("/api/auth/config").json()["oidc_enabled"] is False
