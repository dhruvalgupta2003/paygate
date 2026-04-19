# examples/python-flask

Minimal Flask app behind Limen.

```bash
cp .env.example .env
pip install -e .
python app.py
```

```bash
curl -i http://localhost:3000/api/v1/hello    # 402
curl -i http://localhost:3000/                # 200
```

`pay.sh` prints the 402 + walks through the agent flow.
