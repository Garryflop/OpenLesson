# Supervisor feedback and improvements

## Feedback on the pre-defense presentation (October 2026)

| # | Supervisor's feedback | Action taken | Status |
| --- | --- | --- | --- |
| 1 | Task 2: show the meeting with the Academic-Methodological Department, name the participants and say that the project is the department's request | Added the 8 Oct 2026 meeting with S. A. Shunkeyeva (Head) and S. K. Abisheva (Chief manager). Stated that OpenLesson and its specification come from the department | Completed |
| 2 | Literature review: give the full title of every publication and merge the review into one slide | Added a References slide with 13 entries in APA 7 with DOI. Six review slides merged into one: themes, gaps, decisions, research gap | Completed |
| 3 | Add a Project Management and Risks slide: team roles, timeline from September 2026 to May 2027, GitHub, YouTrack, risks | Added roles of the 3 members, a timeline up to the May 2027 defense and a risk register with probability, impact and mitigation | Completed |
| 4 | Run the project in GitHub and YouTrack, progressive commits and tasks should be visible | GitHub repository and YouTrack project DIP created, all 3 members have access. 42 issues split between the members, commits follow Conventional Commits | Ongoing |

## Requirements for GitHub and YouTrack (October 2026)

| # | Supervisor's feedback | Action taken | Status |
| --- | --- | --- | --- |
| 5 | Make the repository public: the supervisor and the committee should see the whole process and what each student does | The repository is public. Each member commits from their own account, every task has its own branch and pull request reviewed by another member, every commit references its YouTrack issue | Completed |
| 6 | README: title and description, problem, target users, expected outcomes, team and responsibilities, supervisor, scope and current status, technologies, links to the documentation and YouTrack, setup and testing | README rewritten in English with all the required sections | In progress |
| 7 | Documentation: proposal, literature review, existing systems, technology comparison, requirements, context / use case / component diagrams, UI/UX prototype, verification and evaluation plan | All documents are kept in `docs/`. Technology comparison, diagrams and the UX prototype are added before the pre-defense | In progress |
| 8 | YouTrack: every issue needs a description, assignee, priority, due date, acceptance criteria and status; define milestones, dependencies and major risks; mark issues Done only after the acceptance criteria are met | Due dates set for all 42 issues, 5 milestones (pre-defense 24.10.2026, MVP and usability test 30.11.2026, pilot 28.02.2027, evaluation and thesis 30.04.2027, final defense May 2027), dependency links between issues, 5 risk issues with owners. Each member updates the status of their own issues | Completed |

## Committee recommendation for the 1st pre-defense

| # | Recommendation | Action taken | Status |
| --- | --- | --- | --- |
| 9 | Repository structure: `README.md`, `docs/` (proposal, literature review, existing systems, technology comparison, requirements, evaluation plan, supervisor feedback), `diagrams/`, `prototype/`, `src/`, `tests/`, `.gitignore` | `docs/` already uses the recommended file names. Moving diagrams and the prototype to top-level folders and describing the code layout (`backend/`, `frontend/`, `backend/tests/`) in the README is planned after the pre-defense | Planned |

Details: [README](../README.md), [literature review](literature-review.md), [relevance](relevance.md), [project management](project-management/plan.md).
