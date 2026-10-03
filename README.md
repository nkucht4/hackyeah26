# HackYeah26

Backend API for the browser extension. The FastAPI app is organized by feature
so integrations can evolve independently.

## Backend setup

From the repository root, create the virtual environment if needed, install the
backend dependencies, and copy the example configuration:

```bash
python3 -m venv venv
venv/bin/python -m pip install -e "backend[dev]"
cp backend/.env.example backend/.env
```

Set `CORS_ORIGINS` in `backend/.env` to a comma-separated list of exact origins.
Keep the local development origins and add the deployed extension origin when
its ID is known, for example `chrome-extension://<extension-id>`. Do not use `*`.

Start the API from the repository root with Uvicorn:

```bash
venv/bin/uvicorn --app-dir backend --env-file backend/.env app.main:app --reload
```

The OpenAPI UI is available at `http://127.0.0.1:8000/docs`.

## API

- `GET /health` returns `{"status":"ok"}`.
- `POST /api/v1/correction` accepts `{"text":"..."}` and currently returns
	`{"corrections":"Placeholder text"}`. Replace the placeholder in the
	correction service when the correction logic/provider is selected.
- `POST /api/v1/emotions/classify` accepts `{"text":"..."}` and returns a
	`scores` map keyed by emotion label. Scores are model-native values; their
	range and interpretation will be documented when the model is selected.
- Emotion classification currently returns `503` until a model adapter is
	configured. The API contract can be exercised with a fake adapter in tests.

The correction endpoint is a structural placeholder and does not yet call Groq
or perform text correction.

Run the backend tests from the repository root:

```bash
venv/bin/python -m pytest backend/tests
```