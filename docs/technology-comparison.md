# Technology comparison

Three technical decisions, each with several alternatives. The chosen option is marked with a check.

| Decision | Alternative | Main benefit | Consideration |
| --- | --- | --- | --- |
| Backend | Node.js and Express | Flexible JavaScript / TypeScript API | Module structure, validation and access checks are up to the team |
| Backend | Node.js and NestJS | Modules, controllers, dependency injection | Framework conventions to learn |
| Backend | Python and Django | Built-in ORM and admin interface | Server-rendered by default, REST needs an extra framework |
| Backend | **Python and FastAPI ✓** | Typed validation (Pydantic), automatic OpenAPI docs, async | Structure of routers and services is up to the team |
| Database | **PostgreSQL ✓** | Relational integrity and SQL reporting | Design schema and migrations |
| Database | MySQL with InnoDB | Relational model and foreign keys | Team experience and hosting environment |
| Database | MongoDB | Flexible document structure | References, duplication and consistency to plan |
| API | **REST over HTTPS, JSON ✓** | Clear operations for lessons and feedback | Agree on endpoints and response formats |
| API | GraphQL | Client selects fields and related data | Additional schema and resolvers |
| API | WebSocket | Immediate notifications and updates | Persistent connections, added complexity |

## Chosen stack

| Layer | Technology |
| --- | --- |
| Backend | Python, FastAPI, SQLAlchemy 2, APScheduler |
| Database | PostgreSQL (SQLite in development) |
| API | REST over HTTPS, JSON, OpenAPI docs |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |

## Why

- One language for the API, Excel import, PDF and poster generation and the AI client.
- A unique (lesson, teacher) pair blocks duplicate attendees and reviews. Foreign keys keep reports consistent.
- REST covers every operation. WebSocket can be added later if live updates become necessary.

## Sources

[Express](https://expressjs.com/), [NestJS](https://docs.nestjs.com/), [Django](https://docs.djangoproject.com/en/5.2/intro/overview/),
[FastAPI](https://fastapi.tiangolo.com/), [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html),
[MySQL foreign keys](https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html),
[MongoDB relationships](https://www.mongodb.com/docs/manual/data-modeling/schema-design-process/map-relationships/),
[REST](https://developer.mozilla.org/en-US/docs/Glossary/REST), [GraphQL](https://graphql.org/learn/),
[WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API).
