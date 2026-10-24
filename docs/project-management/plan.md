# Project management and risks

## Team responsibilities

| Member | Role | Main responsibilities |
| --- | --- | --- |
| Dana Shokobalinova | PM, research, QA | Plan and YouTrack, contact with the supervisor and the department, interviews, testing and evaluation |
| Nurdaulet Saparbekov | Backend and architecture | FastAPI and database design, automation cycle, integrations: Entra ID, Outlook, Digital University, AI |
| Amina Sergazina | Frontend and UI / UX | React interface and mobile version, UX prototype and usability, KZ / RU / EN localisation |

Supervisor: Yersultan Tulebayev. Client: Academic-Methodological Department, Astana IT University.

## Timeline, September 2026 to May 2027

| Stage | Start | End | Owner |
| --- | --- | --- | --- |
| Requirements and analysis | 1 Sep 2026 | 15 Oct 2026 | Dana |
| Design and architecture | 15 Sep 2026 | 31 Oct 2026 | Nurdaulet, Amina |
| Development: prototype, MVP | 1 Oct 2026 | 31 Jan 2027 | Nurdaulet, Amina |
| Testing, usability test | 15 Oct 2026 | 30 Nov 2026 | Dana |
| Pilot in trimester II | 1 Dec 2026 | 28 Feb 2027 | all |
| Evaluation and thesis | 1 Mar 2027 | 30 Apr 2027 | all |
| Final defense preparation | 1 May 2027 | 31 May 2027 | all |

Milestone: pre-defense on 24 Oct 2026, tag `prob-period-1` in GitHub.

## Tools

- **GitHub:** one branch per issue (`DIP-20-excel-import`), Conventional Commits, a pull request reviewed by a teammate
  and merged into a protected `main`. Rules: [CONTRIBUTING.md](../../CONTRIBUTING.md).
- **YouTrack, project DIP:** 42 issues (DIP-2 ... DIP-43), each with an assignee, priority, due date, milestone and
  acceptance criteria, linked by dependencies. Sprint board columns: Backlog, Development, Review, Done. Every commit ends
  with `Refs: DIP-N` and appears in its issue.

## Risks

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- | --- |
| No access to the AITU Microsoft tenant in time | Medium | High | Demo sign-in and console e-mail until AITU IT registers the app, request sent early |
| Older staff find the system hard to use | Medium | High | Phone-first simple UI in 3 languages, usability test with older staff |
| Requirements change (anonymous feedback, lesson plan) | Medium | Medium | Settings and criteria are configurable, regular check-ins with the department |
| Personal data sent to an external AI service | Low | High | Local LLM option, only review text is sent, AI only advises |
| Delays because of study load | Medium | Medium | 2-week iterations on the YouTrack board, MoSCoW scope, buffer in April |

Each risk is also an issue in YouTrack with an owner (DIP-44 ... DIP-48, tag «Риск»).
