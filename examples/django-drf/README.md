# examples/django-drf

Minimal Django + DRF app behind PayGate.

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

See `paygate_demo/settings.py` for the `PAYGATE = {...}` block that
drives the middleware.
