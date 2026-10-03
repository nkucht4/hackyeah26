const BACKEND_URL = "http://127.0.0.1:8000";
const SPEECH_OFFER_URL = `${BACKEND_URL}/api/v1/speech/webrtc/offer`;

const recordButton = document.getElementById("recordButton");
const buttonCaption = document.getElementById("buttonCaption");
const liveStatus = document.getElementById("liveStatus");
const errorMessage = document.getElementById("errorMessage");
const connectionIndicator = document.getElementById("connectionIndicator");
const connectionLabel = document.getElementById("connectionLabel");
const confidenceValue = document.getElementById("confidenceValue");
const assertivenessValue = document.getElementById("assertivenessValue");
const confidenceMeter = document.querySelector('[aria-label="Confidence score"]');
const assertivenessMeter = document.querySelector('[aria-label="Assertiveness score"]');
const confidenceFill = document.getElementById("confidenceFill");
const assertivenessFill = document.getElementById("assertivenessFill");

let peerConnection = null;
let microphoneStream = null;
let dataChannel = null;
let connectionTimer = null;
let isStarting = false;

let hasReceivedScore = false;


recordButton.addEventListener("click", () => {
  if (peerConnection || isStarting) {
    stopRecording();
    return;
  }

  startRecording();
});

window.addEventListener("pagehide", () => stopRecording(false));

async function startRecording() {
  isStarting = true;
  recordButton.disabled = true;
  errorMessage.hidden = true;
  hasReceivedScore = false;

  setConnectionState("connecting", "Connecting");
  liveStatus.textContent = "Requesting microphone access…";
  resetScores();

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    const connection = new RTCPeerConnection({ iceServers: [] });
    peerConnection = connection;
    microphoneStream.getTracks().forEach(track => {
      connection.addTrack(track, microphoneStream);
    });

    const channel = connection.createDataChannel("text");
    dataChannel = channel;
    channel.addEventListener("open", () => {
      if (peerConnection !== connection) return;
      channel.send("handshake");
      isStarting = false;
      recordButton.disabled = false;
      recordButton.setAttribute("aria-pressed", "true");
      recordButton.setAttribute("aria-label", "Stop recording");
      buttonCaption.textContent = "Stop recording";
      liveStatus.textContent = "Microphone connected · waiting for the first score.";
      setConnectionState("recording", "Recording");
      connectionTimer = window.setTimeout(() => {
        if (peerConnection !== connection || hasReceivedScore) return;
        stopRecording();
        showError("No speech score arrived. Speak continuously for at least two seconds, then check the backend logs if this continues.");
      }, 10000);

    });
    channel.addEventListener("message", handleScoreMessage);
    channel.addEventListener("close", () => {
      if (peerConnection === connection) {
        stopRecording();
        showError("The score stream closed. Start a new recording to reconnect.");
      }
    });

    connection.addEventListener("connectionstatechange", () => {
      if (peerConnection !== connection) return;
      if (connection.connectionState === "failed") {
        stopRecording();
        showError("The backend connection failed. Check that the speech API is running.");
      } else if (connection.connectionState === "disconnected") {
        liveStatus.textContent = "Reconnecting to the speech service…";
      }
    });

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await waitForIceGathering(connection);

    const response = await fetch(SPEECH_OFFER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: connection.localDescription.sdp,
        type: connection.localDescription.type,
        webrtc_id: createWebRtcId()
      })
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Speech service returned ${response.status}: ${responseText.slice(0, 180)}`);
    }

    const answer = await response.json();
    if (answer.status === "failed") {
      throw new Error(answer.meta?.error || "The speech service rejected the connection.");
    }
    await connection.setRemoteDescription(answer);

    connectionTimer = window.setTimeout(() => {
      if (peerConnection === connection && channel.readyState !== "open") {
        stopRecording();
        showError("The backend did not open the score channel. Check the API and its CORS settings.");
      }
    }, 15000);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "An unexpected error occurred.";
    stopRecording(false);

    if (error instanceof TypeError && detail.toLowerCase().includes("fetch")) {
      showError(`Could not reach the backend. Check that it is running and allow ${window.location.origin} in backend CORS_ORIGINS.`);
    } else if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
      showError("Microphone access was denied. Allow microphone access for this extension and try again.");
    } else if (error?.name === "NotFoundError") {
      showError("No microphone was found on this device.");
    } else {
      showError(detail);
    }
  } finally {
    isStarting = false;
    recordButton.disabled = false;
  }
}

function stopRecording(showStatus = true) {
  if (connectionTimer !== null) {
    window.clearTimeout(connectionTimer);
    connectionTimer = null;
  }

  const channel = dataChannel;
  const connection = peerConnection;
  const stream = microphoneStream;
  dataChannel = null;
  peerConnection = null;
  microphoneStream = null;
  isStarting = false;

  if (channel && channel.readyState !== "closed") channel.close();
  if (connection && connection.signalingState !== "closed") connection.close();
  stream?.getTracks().forEach(track => track.stop());

  recordButton.disabled = false;
  recordButton.setAttribute("aria-pressed", "false");
  recordButton.setAttribute("aria-label", "Start recording");
  buttonCaption.textContent = "Start recording";
  setConnectionState("idle", "Ready");
  if (showStatus) liveStatus.textContent = "Recording stopped.";
}

function handleScoreMessage(event) {
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }

  if (message?.type !== "speech.classification") return;
  if (!isPercentage(message.confidence) || !isPercentage(message.assertiveness)) return;

  hasReceivedScore = true;
  if (connectionTimer !== null) {
    window.clearTimeout(connectionTimer);
    connectionTimer = null;
  }
  errorMessage.hidden = true;
  renderScore(message.confidence, confidenceValue, confidenceFill, confidenceMeter);
  renderScore(message.assertiveness, assertivenessValue, assertivenessFill, assertivenessMeter);
  liveStatus.textContent = "Live score updated.";
}

function renderScore(score, valueElement, fillElement, meterElement) {
  const roundedScore = Math.round(score);
  valueElement.innerHTML = `${roundedScore}<span class="percent">%</span>`;
  fillElement.style.width = `${score}%`;
  meterElement.setAttribute("aria-valuenow", String(roundedScore));
}

function resetScores() {
  confidenceValue.innerHTML = '--<span class="percent">%</span>';
  assertivenessValue.innerHTML = '--<span class="percent">%</span>';
  confidenceFill.style.width = "0";
  assertivenessFill.style.width = "0";
  confidenceMeter.setAttribute("aria-valuenow", "0");
  assertivenessMeter.setAttribute("aria-valuenow", "0");
}

function setConnectionState(state, label) {
  connectionIndicator.dataset.state = state;
  connectionLabel.textContent = label;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
  liveStatus.textContent = "Recording unavailable.";
  setConnectionState("error", "Connection issue");
}

function isPercentage(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function createWebRtcId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function waitForIceGathering(connection) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      connection.removeEventListener("icegatheringstatechange", onGatheringChange);
      reject(new Error("Timed out while preparing the audio connection."));
    }, 10000);

    function onGatheringChange() {
      if (connection.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onGatheringChange);
      resolve();
    }

    connection.addEventListener("icegatheringstatechange", onGatheringChange);
  });
}
