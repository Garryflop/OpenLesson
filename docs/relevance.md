# Evidence of relevance

OpenLesson is a request of the Academic-Methodological Department of Astana IT University. The department wrote the
specification, and one teacher interviews confirmed the main problems of the current manual process.

## Meeting with the Academic-Methodological Department, 8 Oct 2026

| Participant | Position |
| --- | --- |
| Shunkeyeva Saule Alisherovna | Head of the department |
| Abisheva Sandugash Kanatovna | Chief manager |

- The department asked for the platform and prepared the specification: 8 modules, 5 roles.
- It explained the current attendance process: a staff member of the department marks attendees on a paper attendance
  sheet, and the methodologist enters the list afterwards.

## Teacher interviews, 14 Oct 2026

One interview has been conducted with respondent B, a teacher at the School of Cybersecurity who has given open lessons. A total of approximately 4–5 interviews is planned.

| Respondent | Profile |
| --- | --- |
| B | Teacher at the School of Cybersecurity who has given open lessons |

## Hypotheses

| Hypothesis | Status | Evidence |
| --- | --- | --- |
| H1 Schedule and forms are handled manually | Confirmed | Paper template, list via Google Form, e-mails sent by hand (B) |
| H2 Feedback arrives late and is generic | Confirmed | About 1 week via the dean, "everyone writes the same" (B) |
| H3 No summary analytics | Indirect | B asks for trimester statistics and a comparison across observers |
| H4 Staff will use a phone form | Partly | Fine for younger staff, harder for the older generation (B) |

## Findings from interview B and proposed requirements

| Finding | Requirement |
| --- | --- |
| "The e-mail comes on the same day, at most a day before." | Reminders 10, 7 and 3 days ahead (M2) |
| "Today they tell you, tomorrow you teach." | Teachers pick date and topic at the start of the year (M1) |
| Feedback arrives after about 1 week via the dean and is posted in a group chat | Within 3 days, visible only to the teacher, dean and methodologist (M6) |
| "No time to sit and write... everyone writes the same." | Quick checklist of closed questions and one optional comment (M6) |
| "A recommendation from one person may be subjective." | Compare several observers, AI summary of common points (M7, M8) |
| Phone is fine for me, harder for older colleagues | Simple interface for laptop and phone (non-functional) |

## Gaps found in the specification

- B prefers anonymous feedback, but the specification requires named reviews.
- B's school has no separate lesson plan (syllabus and slides in Moodle), but the specification annuls lessons without one.
