import secrets
import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import settings
from app.i18n import tr
from app.models import LessonMaterial

ALLOWED = {
    "presentation": {".ppt", ".pptx"},
    "plan": {".doc", ".docx", ".pdf"},
}


def root() -> Path:
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    return settings.storage_dir


def subdir(name: str) -> Path:
    path = root() / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def material_path(material: LessonMaterial) -> Path:
    return root() / "materials" / material.stored_name


def save_upload(upload: UploadFile, folder: str, allowed: set[str]) -> tuple[str, int]:
    """Stream an upload to ``storage/<folder>`` and return (stored_name, size)."""
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in allowed:
        formats = ", ".join(sorted(allowed))
        raise HTTPException(400, tr(f"Недопустимый формат файла. Разрешено: {formats}", f"File format not allowed. Allowed: {formats}",
                                    f"Файл форматына рұқсат жоқ. Рұқсат етілген форматтар: {formats}"))
    stored = f"{secrets.token_hex(12)}{suffix}"
    dest = subdir(folder) / stored
    limit = settings.max_upload_mb * 1024 * 1024
    size = 0
    with dest.open("wb") as out:
        while chunk := upload.file.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                out.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(413, tr(f"Файл превышает {settings.max_upload_mb} МБ", f"The file exceeds {settings.max_upload_mb} MB",
                                            f"Файл көлемі {settings.max_upload_mb} МБ-тан асып кетті"))
            out.write(chunk)
    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, tr("Пустой файл", "The file is empty", "Файл бос"))
    return stored, size


def remove(relative: str | None) -> None:
    if relative:
        (root() / relative).unlink(missing_ok=True)


def copy_into(src: Path, folder: str, name: str) -> str:
    dest = subdir(folder) / name
    shutil.copyfile(src, dest)
    return f"{folder}/{name}"
