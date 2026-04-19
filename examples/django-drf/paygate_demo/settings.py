from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-not-for-production")
DEBUG = os.environ.get("DJANGO_DEBUG", "true").lower() == "true"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "app",
]

MIDDLEWARE = [
    "limen.django.LimenMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "limen_demo.urls"
WSGI_APPLICATION = "limen_demo.wsgi.application"

LIMEN = {
    "wallets": {
        "base-sepolia": os.environ.get(
            "LIMEN_WALLET_BASE_SEPOLIA",
            "0x0000000000000000000000000000000000000001",
        ),
    },
    "endpoints": [
        {"path": "/api/v1/premium/*", "price_usdc": "0.05"},
        {"path": "/api/v1/ping", "price_usdc": "0.001"},
    ],
    "redis_url": os.environ.get("REDIS_URL"),
    "default_chain": "base-sepolia",
}

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
