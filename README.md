# Directly — HackYeah 2026

Directly is a smart browser extension that acts as a real-time communication linter for professional workplace tools. Instead of rewriting entire emails with generic chatbots, Directly provides a targeted, privacy-conscious feedback loop directly in your text fields and a voice training sandbox.

---

# Concept

Women in technical and professional environments systematically face the "likability Trap" (the Double Bind): direct, concise communication is frequently penalized as abrasive or aggressive, while indirect communication leads to being dismissed as hesitant or junior.

To navigate this systemic bias, women subconsciously adopt self-diminishing communication patterns (hedging, minimizers, erasing personal credit). Research proves that women have a significantly lower threshold for what constitutes an offense, leading them to issue unnecessary apologies for routine work duties (e.g., asking for updates, reporting bugs, taking leave).

In tech workflows, this results in:

- Eroded technical authority: Messages diluted with “just wondering” or “probably a dumb question” get deprioritized in backlogs and pull requests.

- Massive cognitive tax: Significant daily time and mental bandwidth wasted on second-guessing and repeatedly editing emails to manage the recipient's comfort.

- Career stagnation: A direct correlation between habitual self-diminishing language and missed leadership promotions, despite equal technical competence.

Directly is a smart browser extension that acts as a real-time communication linter for professional workplace tools. Instead of rewriting entire emails with generic chatbots, Directly provides a targeted, privacy-conscious feedback loop directly in your text fields and a voice training sandbox.

Key Technical Features:

- DOM Interceptor & Selective Capture: Hooks into text fields and captures only manually selected text or snippets submitted via the Directly button, eliminating unnecessary data transmission.
- Precision Tagging & Structured API: A FastAPI backend powered by BERT-Tiny scores and classifies linguistic patterns (such as Downplaying, Over-Softened phrasing, and Politeness), returning exact character offsets, actionable suggestions, and context-aware rationales via strict JSON schemas.
- Granular In-Situ Control: Enables users to interactively accept or reject suggested replacements phrase by phrase directly in the DOM, keeping the author in full control of their voice.
- Take a step further with Real-Time Voice Check Sandbox: Analyzes spoken delivery in live two-second audio windows to measure Confidence and Assertiveness scores before high-stakes meetings.

Benefits for Users & Organizations:

- Removes the cognitive burden of second-guessing everyday messages, protects against the Likability Trap, and builds long-term assertiveness in both written and spoken communication.
- Faster resolution of blocker tickets through clear, direct peer communication and a practical, scalable tool supporting genuine inclusion without patronizing training.

---

# Project status

Project Goal:

Directly helps women eliminate self-diminishing habits (unwarranted apologies, minimizers) in everyday workplace tools, protecting their authority without sounding aggressive.

The entire concept, design, frontend extension, and ML/backend architecture were developed from scratch during this hackathon.


What’s Done So Far:

- Text Linter (Fully Working): Browser extension capturing input in text fields, FastAPI backend with structured JSON schemas, BERT-Tiny classification (downplaying, over-softening), and live in-situ Accept/Reject controls.

- Voice Check (UI & Capture Ready): Built the audio-capture interface and 2-second streaming pipeline; live speech inference is still in progress due to time limits.

---

# Demo

[Demo link](https://www.youtube.com/watch?v=YugcIuSmoR0)

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
