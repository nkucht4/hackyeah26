const BACKEND_URL = "http://127.0.0.1:8000";
const SPEECH_OFFER_URL = `${BACKEND_URL}/api/v1/speech/webrtc/offer`;
const SPEECH_LOG_PREFIX = "DEBUG_VOICe";

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
let currentWebRtcId = null;

let hasReceivedScore = false;

function logSpeech(event, details = {}) {
  console.info(`${SPEECH_LOG_PREFIX} ${event}`, details);
}

recordButton.addEventListener("click", () => {
  if (peerConnection || isStarting) {
    logSpeech("record_button_stop", {
      webRtcId: currentWebRtcId,
      connectionState: peerConnection?.connectionState ?? "none",
      isStarting
    });
    stopRecording();
    return;
  }

  logSpeech("record_button_start");
  startRecording();
});

window.addEventListener("pagehide", () => stopRecording(false));

async function startRecording() {
  currentWebRtcId = createWebRtcId();
  const webRtcId = currentWebRtcId;
  const startedAt = performance.now();
  isStarting = true;
  recordButton.disabled = true;
  errorMessage.hidden = true;
  hasReceivedScore = false;

  setConnectionState("connecting", "Connecting");
  liveStatus.textContent = "Requesting microphone access…";
  resetScores();
  logSpeech("recording_start", { webRtcId, offerUrl: SPEECH_OFFER_URL });

  try {
    microphoneStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    logSpeech("microphone_ready", {
      webRtcId,
      tracks: microphoneStream.getAudioTracks().length,
      settings: microphoneStream.getAudioTracks()[0]?.getSettings()
    });

    const connection = new RTCPeerConnection({ iceServers: [] });
    peerConnection = connection;
    connection.addEventListener("connectionstatechange", () => {
      logSpeech("peer_connection_state", {
        webRtcId,
        state: connection.connectionState
      });
    });
    connection.addEventListener("iceconnectionstatechange", () => {
      logSpeech("ice_connection_state", {
        webRtcId,
        state: connection.iceConnectionState
      });
    });
    connection.addEventListener("icegatheringstatechange", () => {
      logSpeech("ice_gathering_state", {
        webRtcId,
        state: connection.iceGatheringState
      });
    });
    microphoneStream.getTracks().forEach(track => {
      connection.addTrack(track, microphoneStream);
    });

    const channel = connection.createDataChannel("text");
    dataChannel = channel;
    channel.addEventListener("open", () => {
      logSpeech("data_channel_open", { webRtcId, label: channel.label });
    });
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
        logSpeech("score_timeout", {
          webRtcId,
          timeoutMs: 10000,
          elapsedMs: Math.round(performance.now() - startedAt)
        });
        stopRecording();
        showError("No speech score arrived. Speak continuously for at least two seconds, then check the backend logs if this continues.");
      }, 10000);

    });
    channel.addEventListener("message", handleScoreMessage);
    channel.addEventListener("close", () => {
      logSpeech("data_channel_close", {
        webRtcId,
        wasActive: peerConnection === connection
      });
      if (peerConnection === connection) {
        stopRecording();
        showError("The score stream closed. Start a new recording to reconnect.");
      }
    });
    channel.addEventListener("error", event => {
      logSpeech("data_channel_error", { webRtcId, eventType: event.type });
    });

    connection.addEventListener("connectionstatechange", () => {
      if (peerConnection !== connection) return;
      if (connection.connectionState === "failed") {
        logSpeech("peer_connection_failed", { webRtcId });
        stopRecording();
        showError("The backend connection failed. Check that the speech API is running.");
      } else if (connection.connectionState === "disconnected") {
        liveStatus.textContent = "Reconnecting to the speech service…";
      }
    });

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    logSpeech("offer_created", {
      webRtcId,
      type: connection.localDescription?.type,
      iceGatheringState: connection.iceGatheringState
    });
    await waitForIceGathering(connection);

    logSpeech("offer_post_start", { webRtcId });
    const response = await fetch(SPEECH_OFFER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: connection.localDescription.sdp,
        type: connection.localDescription.type,
        webrtc_id: webRtcId
      })
    });
    logSpeech("offer_post_response", {
      webRtcId,
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Speech service returned ${response.status}: ${responseText.slice(0, 180)}`);
    }

    const answer = await response.json();
    logSpeech("offer_answer_received", {
      webRtcId,
      answerType: answer.type,
      status: answer.status
    });
    if (answer.status === "failed") {
      throw new Error(answer.meta?.error || "The speech service rejected the connection.");
    }
    await connection.setRemoteDescription(answer);
    logSpeech("remote_description_set", { webRtcId });

    connectionTimer = window.setTimeout(() => {
      if (peerConnection === connection && channel.readyState !== "open") {
        logSpeech("data_channel_timeout", {
          webRtcId,
          readyState: channel.readyState,
          timeoutMs: 15000
        });
        stopRecording();
        showError("The backend did not open the score channel. Check the API and its CORS settings.");
      }
    }, 15000);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "An unexpected error occurred.";
    logSpeech("recording_error", { webRtcId, message: detail });
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
  const webRtcId = currentWebRtcId;
  if (connectionTimer !== null) {
    window.clearTimeout(connectionTimer);
    connectionTimer = null;
  }

  const channel = dataChannel;
  const connection = peerConnection;
  const stream = microphoneStream;
  logSpeech("recording_stop", {
    webRtcId,
    showStatus,
    connectionState: connection?.connectionState ?? "none",
    channelState: channel?.readyState ?? "none"
  });
  dataChannel = null;
  peerConnection = null;
  microphoneStream = null;
  currentWebRtcId = null;
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
  } catch (error) {
    logSpeech("score_message_invalid_json", {
      webRtcId: currentWebRtcId,
      message: error instanceof Error ? error.message : "invalid JSON"
    });
    return;
  }

  if (message?.type !== "speech.classification") {
    logSpeech("score_message_unexpected_type", {
      webRtcId: currentWebRtcId,
      type: message?.type
    });
    return;
  }
  if (!isPercentage(message.confidence) || !isPercentage(message.assertiveness)) {
    logSpeech("score_message_invalid_scores", {
      webRtcId: currentWebRtcId,
      confidenceValid: isPercentage(message.confidence),
      assertivenessValid: isPercentage(message.assertiveness)
    });
    return;
  }

  hasReceivedScore = true;
  logSpeech("score_received", {
    webRtcId: currentWebRtcId,
    confidence: message.confidence,
    assertiveness: message.assertiveness
  });
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
  if (connection.iceGatheringState === "complete") {
    logSpeech("ice_gathering_complete", { webRtcId: currentWebRtcId });
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      connection.removeEventListener("icegatheringstatechange", onGatheringChange);
      logSpeech("ice_gathering_timeout", { webRtcId: currentWebRtcId });
      reject(new Error("Timed out while preparing the audio connection."));
    }, 10000);

    function onGatheringChange() {
      if (connection.iceGatheringState !== "complete") return;
      window.clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onGatheringChange);
      logSpeech("ice_gathering_complete", { webRtcId: currentWebRtcId });
      resolve();
    }

    connection.addEventListener("icegatheringstatechange", onGatheringChange);
  });
}
