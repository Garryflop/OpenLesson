from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DEV_SECRET = "dev-only-secret-key-change-me-in-production"


class Settings(BaseSettings):
    """Infrastructure settings (read from environment / .env).

    Business rules that the administrator may change at runtime (deadlines,
    annulment policy, poster colours, ...) live in the database instead —
    see ``app.services.app_settings``.
    """

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "OpenLesson"
    environment: str = "development"  # development | production
    database_url: str = f"sqlite:///{(BASE_DIR / 'openlesson.db').as_posix()}"
    secret_key: str = DEV_SECRET
    timezone: str = "Asia/Almaty"  # Kazakhstan, UTC+5
    frontend_url: str = "http://localhost:5173"
    session_hours: int = 12
    cookie_secure: bool = False

    # --- Authentication: OpenID Connect (Microsoft Entra ID / Outlook) -----------------
    oidc_provider_name: str = "Microsoft"
    oidc_client_id: str = ""
    oidc_client_secret: str = ""
    # e.g. https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration
    oidc_discovery_url: str = ""
    oidc_redirect_uri: str = "http://localhost:5173/api/auth/callback"
    oidc_scopes: str = "openid email profile"
    allowed_email_domains: str = ""  # comma separated, e.g. "astanait.edu.kz"
    admin_emails: str = ""  # comma separated; granted the admin role on first sign-in
    auto_create_users: bool = True
    dev_login_enabled: bool = True  # demo sign-in without OIDC (disable in production!)

    # --- E-mail ------------------------------------------------------------------------
    email_backend: str = "console"  # console | smtp | graph
    email_from: str = "openlesson@astanait.edu.kz"
    email_from_name: str = "OpenLesson AITU"
    smtp_host: str = "smtp.office365.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    graph_tenant_id: str = ""
    graph_client_id: str = ""
    graph_client_secret: str = ""
    graph_sender: str = ""  # mailbox UPN used for /users/{sender}/sendMail
    email_max_attempts: int = 5

    # --- AI Assistant -------------------------------------------------------------------
    # One OpenAI-compatible client: the OpenAI API (ChatGPT) or a local LLM server
    # (Ollama, LM Studio, vLLM). Without a provider the rule-based analyser is used.
    ai_enabled: bool = True
    ai_provider: str = "openai"  # openai | local
    ai_api_key: str = ""  # OpenAI key (OPENAI_API_KEY also works); not needed for a local LLM
    ai_base_url: str = ""  # default: https://api.openai.com/v1 (openai) / http://localhost:11434/v1 (local, Ollama)
    ai_model: str = ""  # default: gpt-4o-mini (openai) / qwen2.5:7b (local)
    ai_timeout: int = 120

    # --- Files / misc --------------------------------------------------------------------
    storage_dir: Path = BASE_DIR / "storage"
    max_upload_mb: int = 50
    font_regular: str = ""
    font_bold: str = ""

    # --- Background automation -----------------------------------------------------------
    scheduler_enabled: bool = True
    scheduler_interval_minutes: int = 5

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def oidc_enabled(self) -> bool:
        return bool(self.oidc_client_id and self.oidc_discovery_url)

    @property
    def allowed_domains(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_email_domains.split(",") if d.strip()]

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
