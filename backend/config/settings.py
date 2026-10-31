from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False), OPEN_SIGNUP=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

DEBUG = env("DEBUG")
SECRET_KEY = env("SECRET_KEY", default="dev-only-change-me" if DEBUG else environ.Env.NOTSET)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "allauth",
    "allauth.account",
    "allauth.headless",
    "allauth.mfa",
    "simple_history",
    "rules.apps.AutodiscoverRulesConfig",
    "apps.core",
    "apps.academic",
    "apps.identity",
    "apps.enrollment",
    "apps.scheduling",
    "apps.notices",
    "apps.chat",
    "apps.assignments",
    "apps.governance",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# SQLite is the fallback so the project runs without Docker; use Postgres everywhere else.
DATABASES = {"default": env.db("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}")}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REDIS_URL = env("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {
        "default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

CELERY_BROKER_URL = REDIS_URL or "redis://localhost:6379/0"
CELERY_TASK_ALWAYS_EAGER = not REDIS_URL
CELERY_TASK_ACKS_LATE = True

AUTH_USER_MODEL = "identity.User"
AUTHENTICATION_BACKENDS = [
    "rules.permissions.ObjectPermissionBackend",
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# allauth: email login, headless API for the Next.js app, sign-up closed unless OPEN_SIGNUP.
ACCOUNT_ADAPTER = "apps.identity.adapters.AccountAdapter"
ACCOUNT_USER_MODEL_USERNAME_FIELD = None
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*", "password2*"]
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION = True
ACCOUNT_RATE_LIMITS = {"login_failed": "5/5m/ip,5/5m/key"}
CAMPUSVERSE_OPEN_SIGNUP = env("OPEN_SIGNUP")
HEADLESS_ONLY = True
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": f"{FRONTEND_URL}/account/verify-email/{{key}}",
    "account_reset_password_from_key": f"{FRONTEND_URL}/account/password/reset/{{key}}",
    "account_signup": f"{FRONTEND_URL}/account/signup",
}
MFA_SUPPORTED_TYPES = ["totp", "recovery_codes"]

EMAIL_CONFIG = env.email_url("EMAIL_URL", default="consolemail://")
vars().update(EMAIL_CONFIG)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="CampusVerse <no-reply@localhost>")

CENTRIFUGO_API_URL = env("CENTRIFUGO_API_URL", default="http://localhost:8001/api")
CENTRIFUGO_API_KEY = env("CENTRIFUGO_API_KEY", default="")
CENTRIFUGO_TOKEN_SECRET = env("CENTRIFUGO_TOKEN_SECRET", default="")
if not DEBUG and 0 < len(CENTRIFUGO_TOKEN_SECRET) < 32:
    raise environ.ImproperlyConfigured("CENTRIFUGO_TOKEN_SECRET must be at least 32 characters.")
CENTRIFUGO_WS_URL = env(
    "CENTRIFUGO_WS_URL", default="ws://localhost:8001/connection/websocket"
)

LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("ur", "Urdu")]
TIME_ZONE = env("TIME_ZONE", default="UTC")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Uploads are private: MEDIA_ROOT is never served directly, only through permission-checked
# download endpoints.
MEDIA_ROOT = env("MEDIA_ROOT", default=str(BASE_DIR / "media"))
CAMPUSVERSE_MAX_UPLOAD_MB = env.int("MAX_UPLOAD_MB", default=20)
DATA_UPLOAD_MAX_NUMBER_FILES = 10

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[FRONTEND_URL])
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
