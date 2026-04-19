# examples/django-drf

Minimal Django + DRF app behind Limen.

```bash
cp .env.example .env
pip install -e .
python manage.py migrate
python manage.py runserver 0.0.0.0:3000
```

```bash
curl -i http://localhost:3000/api/v1/ping              # 402
curl -i http://localhost:3000/api/v1/premium/gold      # 402, $0.05
```

See `limen_demo/settings.py` for the `LIMEN = {...}` block that
drives the middleware.
