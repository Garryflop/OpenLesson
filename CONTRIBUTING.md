# Contributing to OpenLesson

## Branches

- `main` is protected. Changes reach it only through a pull request with one approval from another team member.
- One branch per YouTrack issue: `DIP-<number>-<short-name>`, for example `DIP-19-excel-import`.
- Start every branch from the latest `main`:

```bash
git switch main
git pull
git switch -c DIP-19-excel-import
```

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
<type>(<scope>): <what changed>

<why, if it is not obvious>

Refs: DIP-<number>
```

- English, imperative mood (`add`, not `added`), lower case, no full stop, at most 72 characters.
- One logical change per commit. Backend and frontend changes go into separate commits.
- The last line `Refs: DIP-<number>` links the commit to its YouTrack issue.
- A breaking API change: `feat(api)!: ...` and a `BREAKING CHANGE: ...` line in the body.

| Type | Use it for |
| --- | --- |
| `feat` | a new feature users can see |
| `fix` | a bug fix |
| `docs` | documentation only |
| `test` | adding or changing tests |
| `refactor` | code changes that keep behaviour |
| `style` | formatting only |
| `perf` | performance |
| `build` | build system and dependencies |
| `ci` | GitHub Actions |
| `chore` | other maintenance: `.gitignore`, assets, demo data |
| `revert` | reverting a commit |

Scopes. Backend: `api`, `db`, `auth`, `users`, `schedule`, `lessons`, `notify`, `materials`, `poster`, `attendance`,
`feedback`, `automation`, `ai`, `analytics`, `seed`. Frontend: `frontend`, `ui`, `client`, `i18n`, `layout`, `pages`,
`lesson-ui`, `feedback-ui`, `admin`, `analytics-ui`, `map`. Documents: `pm`, `research`, `diagrams`, `ux`.

## Pull requests

- Title: the main commit message plus the issue, for example `feat(schedule): add Excel import (DIP-19)`.
- Fill in the template. Ask for a review: backend is reviewed by Amina or Dana, frontend by Nurdaulet, documents by anyone.
- Merge with **Rebase and merge**, so `main` keeps every commit with its author, then delete the branch.
- YouTrack: branch created means `In progress`, pull request opened means `Review`, merged means `Done`.

## Never commit

- `backend/.env` (keys and passwords)
- `backend/data/private/` (the staff directory is personal data)
- databases `*.db` and uploaded files in `backend/storage/`
- `node_modules/`, `dist/`, `.venv/`
