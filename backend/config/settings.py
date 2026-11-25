from pathlib import Path

import environ
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env(DEBUG=(bool, False), OPEN_SIGNUP=(bool, False))
environ.Env.read_env(BASE_DIR / ".env")

DEBUG = env("DEBUG")
SECRET_KEY = env("SECRET_KEY", default="dev-only-change-me" if DEBUG else environ.Env.NOTSET)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
# Render tells each service its own public hostname; accept it without listing it by hand.
if RENDER_HOST := env("RENDER_EXTERNAL_HOSTNAME", default=""):
    ALLOWED_HOSTS.append(RENDER_HOST)
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
    "apps.notifications",
    "apps.administration",
    "apps.feed",
    "apps.resources",
    "apps.events",
    "apps.attendance",
    "apps.classreps",
    "apps.search",
    "apps.governance",
    "corsheaders",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Serves the admin's CSS and JS in production (collected into STATIC_ROOT at build time).
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "corsheaders.middleware.CorsMiddleware",
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
        # Our own wording for the sign-in emails (templates/account/email/), ahead of allauth's.
        "DIRS": [BASE_DIR / "templates"],
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
# Reuse database connections between requests (and check they are still alive) in production.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=0 if DEBUG else 60)
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REDIS_URL = env("REDIS_URL", default="")
if REDIS_URL:
    CACHES = {
        "default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": REDIS_URL}
    }
else:
    # Without Redis, a database table: every server process (Render runs two) sees the same
    # counts, so sign-in lock-outs and rate limits hold. Created by `manage.py createcachetable`.
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.db.DatabaseCache",
            "LOCATION": "cv_cache",
        }
    }

CELERY_BROKER_URL = REDIS_URL or "redis://localhost:6379/0"
CELERY_TASK_ALWAYS_EAGER = not REDIS_URL
# Without a Celery worker, notification emails go out in a background thread after the response
# (one mail connection for the lot) instead of inside the request; the cron job sends leftovers.
CAMPUSVERSE_EMAIL_IN_BACKGROUND = env.bool("EMAIL_IN_BACKGROUND", default=not REDIS_URL)
# Phone push notifications through Expo's push service (the mobile app registers each phone).
# EXPO_ACCESS_TOKEN is only needed if "enhanced push security" is on in the Expo project.
CAMPUSVERSE_PUSH_ENABLED = env.bool("PUSH_ENABLED", default=True)
EXPO_ACCESS_TOKEN = env("EXPO_ACCESS_TOKEN", default="")
CELERY_TASK_ACKS_LATE = True
CELERY_BEAT_SCHEDULE = {
    "assignment-notifications": {
        "task": "apps.notifications.tasks.send_scheduled",
        "schedule": 300.0,
    },
    "sync-sources": {
        "task": "apps.administration.tasks.run_due_sources",
        "schedule": 900.0,
    },
    "scheduled-notices": {
        "task": "apps.notices.tasks.publish_due",
        "schedule": 60.0,
    },
}

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
# Finishing an invite (or a reset) signs you straight in instead of asking for the password again.
ACCOUNT_LOGIN_ON_PASSWORD_RESET = True
ACCOUNT_EMAIL_SUBJECT_PREFIX = ""  # subjects already say CampusVerse
# Each account gets 5 wrong passwords per 5 minutes. The per-address counts are generous because
# a whole campus can share one address on the college Wi-Fi.
ACCOUNT_RATE_LIMITS = {
    "login_failed": "40/5m/ip,5/5m/key",
    "login": "120/m/ip",
}
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
# Give up on a mail server that doesn't answer, well before the web worker's own 60-second limit
# (a blocked port, as on Render's free plan for 25/465/587, otherwise hangs the request).
EMAIL_TIMEOUT = env.int("EMAIL_TIMEOUT", default=15)

# The mobile app calls the API directly with X-Session-Token; native builds need no CORS. Only
# its web preview in development does (e.g. MOBILE_WEB_ORIGINS=http://localhost:8081).
# No cookies cross origins: the token is the only credential.
CORS_ALLOWED_ORIGINS = env.list("MOBILE_WEB_ORIGINS", default=[])
CORS_ALLOW_HEADERS = (*default_headers, "x-session-token")
CORS_ALLOW_CREDENTIALS = False

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
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"
        if DEBUG
        else "whitenoise.storage.CompressedManifestStaticFilesStorage"
    },
}
# Uploads are private: MEDIA_ROOT is never served directly, only through permission-checked
# download endpoints.
MEDIA_ROOT = env("MEDIA_ROOT", default=str(BASE_DIR / "media"))

# On a host whose disk is wiped at every deploy or restart (Render's free plan), uploads go to a
# Cloudflare R2 bucket instead. The bucket stays private: files are still only handed out by the
# permission-checked download endpoints, which read them from R2. Without R2_BUCKET (development),
# uploads stay in MEDIA_ROOT.
R2_BUCKET = env("R2_BUCKET", default="")
if R2_BUCKET:
    from botocore.config import Config as _BotoConfig

    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": R2_BUCKET,
            "endpoint_url": f"https://{env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
            "access_key": env("R2_ACCESS_KEY_ID"),
            "secret_key": env("R2_SECRET_ACCESS_KEY"),
            "region_name": "auto",
            "signature_version": "s3v4",
            "default_acl": None,  # R2 has no per-file permissions; the bucket itself is private
            "file_overwrite": False,
            "location": env("R2_PREFIX", default=""),
            # Only send checksums S3 requires: R2 does not accept every optional one.
            "client_config": _BotoConfig(
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        },
    }
CAMPUSVERSE_MAX_UPLOAD_MB = env.int("MAX_UPLOAD_MB", default=20)
# Sync sources may only be fetched from public HTTPS addresses, unless this is on (development:
# a feed on localhost or the office network).
CAMPUSVERSE_SYNC_ALLOW_PRIVATE = env.bool("SYNC_ALLOW_PRIVATE", default=DEBUG)
# A test deployment can load the demo university (seed_demo) even with DEBUG off. Never turn this
# on for a real institution: the demo accounts share one published password.
CAMPUSVERSE_DEMO_SEED = env.bool("DEMO_SEED", default=False)
# Hosts without Celery beat run the scheduled jobs by calling POST /api/cron with this secret.
# Unset (the default, and in development where beat or inline tasks do the work): no endpoint.
CAMPUSVERSE_CRON_SECRET = env("CRON_SECRET", default="")
# Timed jobs (lecture reminders, CR/GR deadlines, scheduled notices) run inside the API every
# minute while it is up: see apps/core/ticker.py. Off in development and where Celery beat runs.
CAMPUSVERSE_IN_PROCESS_JOBS = env.bool("IN_PROCESS_JOBS", default=not DEBUG and not REDIS_URL)
# Whose theme the public pages (landing, sign-in) show; empty means the first active institution.
CAMPUSVERSE_PUBLIC_INSTITUTION = env("PUBLIC_INSTITUTION", default="")
DATA_UPLOAD_MAX_NUMBER_FILES = 10

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[FRONTEND_URL])
# More addresses allowed to sign in, e.g. a Vercel branch preview
# "https://campusverse-git-dev-yourname.vercel.app".
CSRF_TRUSTED_ORIGINS += env.list("EXTRA_TRUSTED_ORIGINS", default=[])
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
    "loggers": {"httpx": {"level": "WARNING"}},  # one line per Centrifugo call is just noise
}
