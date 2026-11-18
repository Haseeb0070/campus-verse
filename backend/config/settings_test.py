import os

# Tests never depend on a developer's .env: set what they need before the base settings load.
os.environ.setdefault("SECRET_KEY", "test-only-secret")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("SECURE_SSL_REDIRECT", "false")
os.environ["REDIS_URL"] = ""
os.environ["CENTRIFUGO_TOKEN_SECRET"] = "test-token-secret-for-pytest-only-0123456789"

from .settings import *  # noqa: E402, F403

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
CAMPUSVERSE_EMAIL_IN_BACKGROUND = False  # tests read mail.outbox straight after the request
