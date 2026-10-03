# HackYeah26

Backend API for the browser extension. The FastAPI app is organized by feature
so integrations can evolve independently.

## Backend setup

From the repository root, create the virtual environment if needed, install the
backend dependencies, and copy the example configuration:

```bash
python3 -m venv venv
venv/bin/python -m pip install -e "backend[dev,speech-model]"
cp backend/.env.example backend/.env
```

Set `CORS_ORIGINS` in `backend/.env` to a comma-separated list of exact origins.
Keep the local development origins and add the deployed extension origin when
its ID is known, for example `chrome-extension://<extension-id>`. Do not use `*`.

The extension's **Speech recorder** toolbar view connects to
`http://127.0.0.1:8000`. For local use, add the exact extension origin shown by
the recorder page (`window.location.origin`) to `CORS_ORIGINS`; Firefox origins
begin with `moz-extension://` and Chromium origins begin with
`chrome-extension://`. Keep the existing local development origins in the list.
The backend host permissions for both `localhost` and `127.0.0.1` are declared
in the extension manifest.

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
- Speech classification uses FastRTC WebRTC at
	`POST /api/v1/speech/webrtc/offer`. Send mono browser audio; FastRTC converts
	it to 16 kHz, and the backend classifies each completed two-second window.
	Results arrive over the WebRTC data channel as JSON, for example:
	`{"type":"speech.classification","confidence":72.0,"assertiveness":64.0}`.
- The two values are independent percentages returned by the loaded speech
  model. `SPEECH_WINDOW_SECONDS` and `SPEECH_SAMPLE_RATE` configure the incoming
  window length and target rate.
- The speech model directory contains `config.json`, `encoder/`, `processor/`,
  and `confidence_head.pt`. Set `SPEECH_MODEL_PATH` to that directory and
  install `backend[speech-model]` for PyTorch and Transformers support. The
  backend loads local encoder weights when present; otherwise it loads the
  pretrained encoder named in `config.json` from Hugging Face. Likewise, an
  incomplete local processor directory falls back to that pretrained model.

The correction endpoint is a structural placeholder and does not yet call Groq
or perform text correction.

Run the backend tests from the repository root:

```bash
venv/bin/python -m pytest backend/tests
```