# Directly — HackYeah 2026

An in-situ communication linter and assertiveness assistant helping women communicate with authority. Directly detects self-diminishing linguistic patterns in web text fields and offers real-time voice assertiveness practice.

---

## Getting Started

### 1. Backend Setup (FastAPI)

Prerequisites: Python 3.10+

From the repository root, set up your virtual environment, install development dependencies, and create the environment configuration file:

```bash
python3 -m venv venv
source venv/bin/activate
venv/bin/python -m pip install -e "backend[dev]"
cp backend/.env.example backend/.env

```

Configure `backend/.env`:

* Update `CORS_ORIGINS` to a comma-separated list of exact allowed origins (e.g., `http://localhost:3000`, `moz-extension://<addon-uuid>`). Do not use wildcard `*`.

Start the API service via Uvicorn:

```bash
venv/bin/uvicorn --app-dir backend --env-file backend/.env app.main:app --reload

```

* OpenAPI UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* Health Check: [http://127.0.0.1:8000/health](https://www.google.com/search?q=http://127.0.0.1:8000/health)

Run unit and integration tests:

```bash
venv/bin/python -m pytest backend/tests

```

---

### 2. Firefox Extension Setup

1. Open Firefox and type `about:debugging` in the address bar.
2. Click **This Firefox** on the left navigation panel.
3. Click the **Load Temporary Add-on...** button.
4. Navigate to extension directory (`extension/`) and select its `manifest.json` file.
5. Once loaded, copy the extension's Internal UUID (accessible under the add-on details) and add `moz-extension://<internal-uuid>` to `CORS_ORIGINS` in `backend/.env` if cross-origin requests require explicit origin matching.

---

## API Overview

* `GET /health`: Returns server status `{"status": "ok"}`.
* `POST /api/v1/correction`: Accepts `{"text": "..."}` and returns structured tone suggestions and character offsets.
* `POST /api/v1/speech/webrtc/offer`: Handles WebRTC audio channels via FastRTC; evaluates 16 kHz mono streams in 2-second windows to compute assertiveness and confidence indicators.

---

## Architecture & Tech Stack

* **Backend:** FastAPI, Uvicorn, Pydantic, WebRTC / FastRTC
* **Classification:** BERT-Tiny linguistic pattern models, PyTorch


* **Frontend:** Firefox WebExtension, DOM MutationObserver, native input interception


```
