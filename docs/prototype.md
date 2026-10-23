# UX prototype

The prototype is the working web application on demo data: 17 screens, 5 roles, Kazakh, Russian and English. Every
screen works at 390 px, a bottom tab bar keeps the four main sections of each role one tap away. The mock-ups below are
screenshots of the real interface in an iPhone frame (`docs/presentation/iphone-mockups`).

Run it locally with the demo data from the [README](../README.md): `python -m app.seed --reset --lang en` gives English
demo content.

## Design principles

| Principle | What it means in the interface |
| --- | --- |
| Phone first | Every screen works at 390 px, bottom tab bar per role |
| Deadlines always visible | Countdown chips, "1 of 2" progress, reminders 10 and 7 days ahead |
| Feedback in two minutes | 8 criteria with one big tap target (1-5), two short text fields, autosaved draft |
| Accessible by default | WCAG 2.1 AA: keyboard focus, contrast, labels for screen readers, reduced motion |
| Kazakh, Russian, English | KZ / RU / EN switch in the header, notifications, e-mails and posters follow the user's language |

## Scenario 1: teacher prepares the lesson and reads feedback

| Step | Screen | Design choice |
| --- | --- | --- |
| Upload slides and plan | ![My open lesson](presentation/iphone-mockups/teacher_00_my-lessons_390.png) | A checklist with progress, so the teacher always sees what is still missing |
| Get reminded in time | ![Notifications](presentation/iphone-mockups/teacher_01_notifications_390.png) | The same message in two channels. The bell shows the unread count |
| Read feedback and reply | ![Feedback results](presentation/iphone-mockups/teacher_02_act_lessons_16_390.png) | Overview first (scores, summary), individual reviews below |

Teacher's bottom bar: Home, Schedule, My lesson, Reviews, More.

## Scenario 2: methodologist runs the trimester

| Step | Screen | Design choice |
| --- | --- | --- |
| Import and approve the schedule | ![Schedule](presentation/iphone-mockups/method_00_admin_schedule_390.png) | The schedule stays a draft until approved, so mistakes are fixed before anyone is notified |
| Control deadlines | ![Deadline control](presentation/iphone-mockups/method_01_admin_control_390.png) | An inbox of exceptions: only what needs action, most urgent first |
| Enter the attendance sheet | ![Attendees](presentation/iphone-mockups/method_02_act_lessons_19_390.png) | Multi-select search keeps ticked names. On a phone it opens as a bottom sheet |

Methodologist's bottom bar: Home, Schedule, Deadlines, Analytics, More.

## Scenario 3: colleague is invited, attends and gives feedback

1. Three days before the lesson every teacher receives the generated AITU poster by e-mail and in the app.
2. A staff member of the Academic-Methodological Department marks who attended on the paper attendance sheet. The
   methodologist then enters the list.
3. The colleague fills in the feedback form: 8 criteria with big tap targets, autosaved draft, one confirmation.
   Reminders come after 1 and 2 days, the 3-day window closes by itself.

![Feedback form](presentation/iphone-mockups/teacher_03_act_feedback_72_390.png)

## Scenario 4: dean and leadership monitor results

| Step | Screen | Design choice |
| --- | --- | --- |
| Filter and compare | ![Analytics](presentation/iphone-mockups/lead_01_analytics_390.png) | A dean automatically sees only their own school |
| Charts with a table view | ![Charts](presentation/iphone-mockups/lead2_00_act_analytics_390.png) | The same status colours as in the schedule |
| Find the room | ![Campus map](presentation/iphone-mockups/lead_02_map_390.png) | Touch-friendly map: pinch to zoom, floor switcher |

Leadership's bottom bar: Home, Schedule, Analytics, Map, More.
