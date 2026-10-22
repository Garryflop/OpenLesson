# OpenLesson: open lessons platform for Astana IT University

OpenLesson is a web platform for planning, monitoring and analysing open lessons of teaching staff at a higher
education institution. It is a diploma project at Astana IT University, built on request of the university's
Academic-Methodological Department.

- **Documentation:** [docs/](docs/)
- **Task tracker (YouTrack):** https://zarkinzz.youtrack.cloud/issues/DIP
- **Contribution rules:** [CONTRIBUTING.md](CONTRIBUTING.md)

## Problem

Open lessons are planned, announced, checked and reported by hand. Teachers learn about their lesson a day before,
nobody controls the deadline for slides and lesson plans, attendance is kept on a paper sheet, feedback arrives about a
week later through the dean or gets lost, and trimester reports are built manually.

## Target users

| User | What they do in OpenLesson |
| --- | --- |
| Administrator / methodologist | uploads the trimester schedule, controls deadlines, enters attendees from the attendance sheet, sends posters |
| Teacher giving the lesson | uploads slides and the lesson plan, reads feedback and replies to it |
| Observing teacher | attends lessons and fills in the feedback form within 3 days |
| Dean / deputy dean | sees the lessons and analytics of their school |
| University leadership | sees summary analytics and reports for the whole university |

## Expected outcomes

- A working platform with 8 modules: schedule, notifications, materials, invitation poster, attendance, feedback,
  AI assistant, analytics and reports
- An automated lesson cycle: reminders 10 and 7 days ahead, material check before the deadline, poster 3 days ahead,
  feedback collection within 3 days after the lesson
- All feedback and an AI summary in one teacher cabinet
- A dashboard with Excel and PDF reports
- A pilot in one trimester and an evaluation of the results

## Team

| Member | Role | Responsibilities |
| --- | --- | --- |
| Dana Shokobalinova | Project manager, research, QA | plan and YouTrack, contact with the supervisor and the department, interviews, documentation, testing and evaluation |
| Nurdaulet Saparbekov | Backend and architecture | FastAPI and database design, automation cycle, integrations: Microsoft Entra ID, Outlook, AI |
| Amina Sergazina | Frontend and UI / UX | React interface and mobile layout, UX prototype and usability, KZ / RU / EN localisation |

**Supervisor:** Yersultan Tulebayev. **Client:** Academic-Methodological Department, Astana IT University.

## Scope

**In scope:** the 8 modules, 5 roles, a responsive web interface (phone first), university e-mail, Excel import of
the schedule and the staff directory, AI used only as advice, Kazakh, Russian and English interface.

**Out of scope:** a native mobile app, video recording of lessons, full HR or LMS integration, decisions made by AI
without a human.

## Current status (pre-defense 1, 24 October 2026)

| Area | Status |
| --- | --- |
| Research and documentation | proposal, relevance, literature review, existing systems, technology comparison, requirements, diagrams, UX prototype, verification and evaluation plan, project management plan |
| Backend | all 8 modules, roles and access rules, automated lesson cycle, sign-in through Microsoft Entra ID (OpenID Connect) with a demo login |
| Frontend | teacher pages, lesson card, feedback form, notifications, administration, analytics, campus map, KZ / RU / EN |
| Testing | automated backend tests (pytest) and a frontend build run on every pull request |
| Not done yet | connection to the AITU Microsoft tenant (sign-in and e-mail run in demo mode until then), end-to-end tests, usability test, pilot |

Milestones: pre-defense 1 (24.10.2026), MVP and usability test (30.11.2026), pilot in trimester II (28.02.2027),
evaluation and thesis (30.04.2027), final defense (May 2027). Issues, assignees, due dates, dependencies and risks are
in [YouTrack](https://zarkinzz.youtrack.cloud/issues/DIP).

## Technologies

| Part | Technologies |
| --- | --- |
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2, SQLite (PostgreSQL in production), APScheduler, Pillow, ReportLab, openpyxl |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Recharts, lucide-react icons |
| Integrations | Microsoft Entra ID (OpenID Connect), Microsoft Graph or SMTP for Outlook mail, OpenAI API or a local LLM (Ollama, LM Studio) |
| Campus map | SVG floor plans from [aitumap](https://github.com/Yuujiso/aitumap) (MIT) |
| Process | GitHub (branches, pull requests, reviews, GitHub Actions), YouTrack, Conventional Commits |

## Documentation

| Document | File |
| --- | --- |
| Project proposal | [docs/proposal.md](docs/proposal.md) |
| Evidence of relevance | [docs/relevance.md](docs/relevance.md) |
| Literature review | [docs/literature-review.md](docs/literature-review.md) |
| Existing systems comparison | [docs/existing-systems.md](docs/existing-systems.md) |
| Technology comparison | [docs/technology-comparison.md](docs/technology-comparison.md) |
| Functional and non-functional requirements | [docs/requirements.md](docs/requirements.md) |
| System context, use case and component diagrams | [docs/diagrams/](docs/diagrams/) |
| UI / UX prototype | [docs/prototype.md](docs/prototype.md) |
| Verification and evaluation plan | [docs/evaluation-plan.md](docs/evaluation-plan.md) |
| Project management and risks | [docs/project-management/plan.md](docs/project-management/plan.md) |
| Supervisor feedback | [docs/supervisor-feedback.md](docs/supervisor-feedback.md) |
| KZ / RU / EN glossary | [docs/i18n-glossary.md](docs/i18n-glossary.md) |
| Pre-defense presentation | [docs/presentation/](docs/presentation/) |

## Repository structure

| Content | Folder |
| --- | --- |
| Documentation | `docs/` |
| Diagrams (Mermaid sources and SVG) | `docs/diagrams/` |
| UI / UX prototype | `docs/prototype.md` |
| Source code: backend | `backend/app/` (`routers/` API, `services/` business logic, `models.py` data model) |
| Source code: frontend | `frontend/src/` (`pages/`, `components/`, `i18n/`, `map/`) |
| Tests | `backend/tests/` |
| Configuration | `backend/.env.example`, `frontend/vite.config.ts`, `.github/` (pull request template, CI) |

## Setup

Requirements: Python 3.12+, Node.js 20+.

```bash
# 1. Backend
cd backend
python -m venv .venv
.venv\Scripts\activate             # macOS / Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env             # macOS / Linux: cp .env.example .env
python -m app.seed --reset         # demo data: staff directory, 263 campus rooms, 34 lessons
                                   # --lang en: demo content in English
uvicorn app.main:app --reload --port 8000

# 2. Frontend (second terminal)
cd frontend
npm install
npm run dev                        # http://localhost:5173 (proxy /api -> :8000)
```

API documentation (Swagger): http://localhost:8000/docs

## Testing

```bash
cd backend
python -m pytest                   # backend tests
cd ../frontend
npm run build                      # type check and production build
```

Both run automatically on every pull request (GitHub Actions).

### Demo login

Until OpenID Connect is connected to the university tenant, the sign-in page has a **demo login**: search any staff
member by name. Service roles use demo accounts with fictional names:

| Role | User | What to look at |
| --- | --- | --- |
| Administrator | Сейтказина Д. М. | schedule and trimesters, deadline control, settings (demo time), e-mail log |
| Methodologist | Жумабекова А. Е. | attendance of a lesson with status "Held", posters |
| Teacher | printed at the end of `app.seed` | "My open lesson", feedback form, reviews of a past lesson |
| Dean | Касымов Н. Б. (School of Software Engineering) | analytics of their school only |
| Leadership | Омаров Е. С. | summary analytics, Excel and PDF reports |

**Demo time** (Settings, not available in production) moves the platform clock 1, 3 or 7 days ahead and runs the
automation cycle at once, to show reminders, annulment, poster sending and feedback collection.

### Staff directory and personal data

The target source of staff data is the university's Digital University system. Until it is connected, the directory is
loaded from an export of teaching staff (`userId`, full name, school in RU / KZ / EN) placed in
`backend/data/private/teachers.json` (CSV with the same columns also works:
`python -m app.seed --reset --teachers path/to/file.csv`).

- `backend/data/private/` is **excluded from git**: personal data is never committed. Without the file a small
  fictional list is used.
- Re-importing an export updates names and schools by `userId` and keeps roles, e-mails and lesson history.
- Demo lessons and demo reviews are synthetic. Do not publish a demo database built from the real staff list.

## Modules

| Module | What it does |
| --- | --- |
| M1 Schedule | academic years and trimesters, Excel import of the approved schedule with a row-by-row error report, manual lessons with a room picked on the campus map |
| M2 Notifications | in-app notifications and e-mail through the university mail (Microsoft Graph or SMTP), delivery log, automatic and manual retry |
| M3 Materials | slides (PPT / PPTX) and lesson plan (DOC / DOCX / PDF), deadline check, three annulment policies: automatic, after administrator confirmation, extra time |
| M4 Poster | A4 invitation poster (PNG and PDF) with the AITU logo, sent to all teaching staff 3 days before the lesson |
| M5 Attendance | the methodologist enters attendees from the paper attendance sheet; QR self check-in is optional and off by default |
| M6 Feedback | form for confirmed attendees only, criteria 1 to 5 and comments, draft, 3-day window with reminders, teacher replies, PDF export |
| M7 AI assistant | OpenAI API or a local LLM: lesson plan analysis, feedback summary, invitation text; results are marked as recommendations |
| M8 Analytics | dashboard by year, trimester, school, department and teacher; Excel and PDF reports |

Roles: administrator, methodologist, teacher (also an observer at other lessons), dean / deputy dean (own school only),
leadership.

### Lesson life cycle

```
Schedule draft -> Waiting for materials -> Materials uploaded -> Confirmed -> (poster 3 days ahead)
   -> Held -> Feedback collection (3 days) -> Completed
Branches: Deadline missed (administrator decides) | Annulled (restore / reschedule)
```

## Microsoft services

### Sign-in with OpenID Connect (Microsoft Entra ID)

1. Azure Portal, Microsoft Entra ID, App registrations, New registration: "Accounts in this organizational directory
   only".
2. Redirect URI (Web): `http://localhost:5173/api/auth/callback` (in production `https://<domain>/api/auth/callback`).
3. Certificates & secrets, New client secret.
4. In `backend/.env`:
   ```ini
   OIDC_CLIENT_ID=<Application (client) ID>
   OIDC_CLIENT_SECRET=<secret>
   OIDC_DISCOVERY_URL=https://login.microsoftonline.com/<TENANT_ID>/v2.0/.well-known/openid-configuration
   ALLOWED_EMAIL_DOMAINS=astanait.edu.kz
   ```
   Use the URL of the specific tenant, not `common`, so that the `iss` check of the ID token passes.

### Outlook mail

`EMAIL_BACKEND=graph` (recommended): add the application permission `Mail.Send` to the same app registration.
`EMAIL_BACKEND=smtp` works with `smtp.office365.com:587`. In `console` mode letters are not sent but saved to
`storage/outbox` and shown in the e-mail log.

### AI assistant

```env
# OpenAI API
AI_PROVIDER=openai
AI_API_KEY=<key>
AI_MODEL=gpt-4o-mini

# or a local LLM: data stays on the university server (Ollama: ollama pull qwen2.5:7b)
AI_PROVIDER=local
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5:7b
```

Without a key or a running local server a transparent rule-based analysis is used.

## Production

```bash
cd frontend && npm run build       # the backend serves frontend/dist from the same domain
```

`.env`: `ENVIRONMENT=production`, a long `SECRET_KEY`, `DEV_LOGIN_ENABLED=false`, `COOKIE_SECURE=true`,
`FRONTEND_URL=https://<domain>`. PostgreSQL: `pip install "psycopg[binary]"` and
`DATABASE_URL=postgresql+psycopg://user:pass@host/openlesson`. The server refuses to start in production with the demo
key or with the demo login enabled.

## Campus map

The SVG floor plans of building C1 come from [aitumap](https://github.com/Yuujiso/aitumap) (MIT, © Yuujiso). They were
adapted: no Chakra UI dependency, room selection by click, highlighted rooms with open lessons, search with automatic
floor switching, zoom to the selected room, a mini map in the lesson card.
