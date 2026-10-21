"""Text extraction from uploaded lesson plans (DOCX / PDF)."""

from pathlib import Path

MAX_CHARS = 60_000


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    text = ""
    if suffix == ".docx":
        import docx

        doc = docx.Document(str(path))
        parts = [p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append(" | ".join(dict.fromkeys(cells)))
        text = "\n".join(parts)
    elif suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    elif suffix == ".doc":
        # Legacy binary Word: best-effort extraction of readable UTF-16 / cp1251 runs.
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-16-le", errors="ignore")
        except Exception:  # noqa: BLE001
            text = raw.decode("cp1251", errors="ignore")
        text = "".join(ch for ch in text if ch.isprintable() or ch in "\n\t")
    return text.strip()[:MAX_CHARS]
