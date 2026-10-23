# OpenLesson · diagrams (Mermaid)

Sources of the Task 7 diagrams in [Mermaid](https://mermaid.js.org/). The `.svg` files next to them are the
rendered versions (they open in any browser and on GitHub) and are used in the alternative presentation
`docs/presentation/*_Mermaid.pptx`; the main deck keeps the same diagrams drawn with native PowerPoint shapes,
so they stay editable. A `.mmd` file can also be pasted into the [Mermaid Live Editor](https://mermaid.live/).

| File | Diagram |
|---|---|
| [01-system-context.mmd](01-system-context.mmd) | System context (C4 level 1): roles, OpenLesson, Entra ID, Outlook/Graph, OpenAI API / local LLM, AITU Digital University |
| [02-use-cases.mmd](02-use-cases.mmd) | Use cases by actor; orange = started by the scheduler |
| [03-components.mmd](03-components.mmd) | Components (initial draft): React SPA → FastAPI routers → services → ORM, external services |
| [04-lesson-lifecycle.mmd](04-lesson-lifecycle.mmd) | Life cycle of an open lesson (state diagram) |
| [05-data-model.mmd](05-data-model.mmd) | Core data model (ER diagram) |

Render (Node.js; uses the installed Chrome, see `puppeteer.json` with `executablePath`):

```bash
npx -p @mermaid-js/mermaid-cli mmdc -i 01-system-context.mmd -o 01-system-context.svg -c mermaid.config.json -b white
```

`mermaid.config.json` applies the presentation palette (navy `#12355B`, teal `#1F7A6D`, orange `#E8A33D`).
