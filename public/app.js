const connectButton = document.querySelector("#connectButton");
const disconnectButton = document.querySelector("#disconnectButton");
const readSensorButton = document.querySelector("#readSensorButton");
const mockButton = document.querySelector("#mockButton");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const transcript = document.querySelector("#transcript");
const sensorJson = document.querySelector("#sensorJson");
const cropSummary = document.querySelector("#cropSummary");
const toolStatus = document.querySelector("#toolStatus");
const eventLog = document.querySelector("#eventLog");
const textForm = document.querySelector("#textForm");
const textInput = document.querySelector("#textInput");
const textSubmitButton = textForm.querySelector("button");
const remoteAudio = document.querySelector("#remoteAudio");

let peerConnection;
let dataChannel;
let localStream;
let activeAssistantMessage;
let responseText = "";

connectButton.addEventListener("click", connectRealtime);
disconnectButton.addEventListener("click", disconnectRealtime);
readSensorButton.addEventListener("click", () => {
  sendUserText("Please read the current NPK sensor, rank all available crops, and explain the top three.");
});
mockButton.addEventListener("click", () => {
  sendUserText("Use mock N=120 P=30 K=200, rank all available crops, and explain the fertilizer advice for the best crop.");
});
textForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = textInput.value.trim();
  if (!text) {
    return;
  }
  textInput.value = "";
  sendUserText(text);
});

/**
 * Creates a browser-safe WebRTC session using a short-lived token from the local server.
 */
async function connectRealtime() {
  try {
    setStatus("Creating session...", "idle");
    connectButton.disabled = true;

    const tokenPayload = await postJson("/api/realtime/client-secret", {});
    const ephemeralKey =
      tokenPayload.value ||
      tokenPayload.client_secret?.value ||
      tokenPayload.session?.client_secret?.value;

    if (!ephemeralKey) {
      throw new Error("Realtime client secret response did not include an ephemeral key.");
    }

    peerConnection = new RTCPeerConnection();
    peerConnection.ontrack = (event) => {
      [remoteAudio.srcObject] = event.streams;
    };

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    for (const track of localStream.getTracks()) {
      peerConnection.addTrack(track, localStream);
    }

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("open", () => {
      setStatus("Live: speak now", "live");
      setControlsEnabled(true);
      logEvent("Realtime data channel opened.");
    });
    dataChannel.addEventListener("message", (event) => {
      handleRealtimeEvent(JSON.parse(event.data));
    });

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${ephemeralKey}`,
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      throw new Error(await sdpResponse.text());
    }

    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });

    logEvent("WebRTC answer applied.");
  } catch (error) {
    setStatus("Error", "error");
    connectButton.disabled = false;
    appendMessage("tool", `Connection failed: ${error.message}`);
    logEvent(error.message);
    await disconnectRealtime();
  }
}

/**
 * Tears down microphone, WebRTC, and data channel resources.
 */
async function disconnectRealtime() {
  if (localStream) {
    for (const track of localStream.getTracks()) {
      track.stop();
    }
  }

  dataChannel?.close();
  peerConnection?.close();

  localStream = undefined;
  dataChannel = undefined;
  peerConnection = undefined;
  activeAssistantMessage = undefined;
  responseText = "";

  setControlsEnabled(false);
  connectButton.disabled = false;
  setStatus("Idle", "idle");
  logEvent("Session stopped.");
}

/**
 * Sends a typed user message into the active Realtime conversation.
 */
function sendUserText(text) {
  if (!isDataChannelReady()) {
    appendMessage("tool", "Start the voice session first.");
    return;
  }

  appendMessage("user", text);
  sendRealtime({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    },
  });
  sendRealtime({
    type: "response.create",
    response: {
      output_modalities: ["audio"],
    },
  });
}

/**
 * Handles Realtime events sent over the WebRTC data channel.
 */
async function handleRealtimeEvent(event) {
  switch (event.type) {
    case "session.created":
    case "session.updated":
      logEvent(event.type);
      return;

    case "response.output_text.delta":
    case "response.output_audio_transcript.delta":
      responseText += event.delta;
      updateAssistantMessage(responseText);
      return;

    case "response.done":
      await handleResponseDone(event.response);
      return;

    case "error":
      appendMessage("tool", `Realtime error: ${event.error?.message || JSON.stringify(event.error)}`);
      logEvent(`error: ${event.error?.message || "unknown"}`);
      return;

    default:
      return;
  }
}

/**
 * Runs model-requested tool calls and sends the result back to Realtime.
 */
async function handleResponseDone(response) {
  const functionCalls = (response?.output || []).filter((item) => item.type === "function_call");
  if (functionCalls.length === 0) {
    responseText = "";
    activeAssistantMessage = undefined;
    return;
  }

  for (const call of functionCalls) {
    const result = await runToolCall(call);
    sensorJson.textContent = JSON.stringify(result, null, 2);
    renderCropRanking(result);
    toolStatus.textContent = result.ok ? `Tool ${call.name} completed` : `Tool ${call.name} failed`;
    appendMessage("tool", result.ok ? `Tool ${call.name} returned data.` : `Tool ${call.name} failed: ${result.error}`);

    sendRealtime({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      },
    });
  }

  responseText = "";
  activeAssistantMessage = undefined;
  sendRealtime({
    type: "response.create",
    response: {
      output_modalities: ["audio"],
    },
  });
}

/**
 * Dispatches Realtime function calls to local server endpoints.
 */
async function runToolCall(call) {
  let args = {};
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch (error) {
    return { ok: false, error: `Invalid tool arguments: ${error.message}` };
  }

  logEvent(`Tool call: ${call.name}`);
  if (call.name === "read_npk_sensor") {
    return postJson("/api/tools/read-npk", {});
  }
  if (call.name === "mock_npk_sensor") {
    return postJson("/api/tools/mock-npk", args);
  }
  if (call.name === "rank_crops_from_npk") {
    return postJson("/api/tools/rank-crops", args);
  }
  if (call.name === "fetch_realtime_weather") {
    return postJson("/api/tools/weather", args);
  }
  if (call.name === "get_npk_calibration") {
    return postJson("/api/tools/calibration/show", {});
  }
  if (call.name === "reset_npk_calibration") {
    return postJson("/api/tools/calibration/reset", {});
  }
  if (call.name === "set_npk_calibration") {
    return postJson("/api/tools/calibration/set", args);
  }
  if (call.name === "set_npk_offset_calibration") {
    return postJson("/api/tools/calibration/offset", args);
  }
  if (call.name === "set_npk_two_point_calibration") {
    return postJson("/api/tools/calibration/two-point", args);
  }
  return { ok: false, error: `Unknown tool: ${call.name}` };
}

function sendRealtime(payload) {
  dataChannel.send(JSON.stringify(payload));
}

function isDataChannelReady() {
  return dataChannel?.readyState === "open";
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || JSON.stringify(payload));
  }
  return payload;
}

function appendMessage(role, text) {
  const node = document.createElement("div");
  node.className = `message ${role}`;
  node.textContent = text;
  transcript.append(node);
  transcript.scrollTop = transcript.scrollHeight;
  return node;
}

/**
 * Renders a compact deterministic summary so the UI is useful even before the voice answer finishes.
 */
function renderCropRanking(result) {
  cropSummary.replaceChildren();

  if (!result?.ok || !result.stcr_multi_crop) {
    return;
  }

  const soilClass = result.soil_classification;
  const summary = document.createElement("div");
  summary.className = "soil-class";
  summary.textContent = `Soil class: N ${soilClass.n}, P ${soilClass.p}, K ${soilClass.k}`;
  cropSummary.append(summary);

  for (const crop of result.stcr_multi_crop.ranked_crops.slice(0, 5)) {
    const card = document.createElement("article");
    card.className = "crop-card";

    const title = document.createElement("strong");
    title.textContent = `${crop.crop} ${crop.confidence_percent}%`;

    const meta = document.createElement("span");
    meta.textContent = `${crop.variant} | target ${crop.target_yield} ${crop.target_yield_unit}`;

    const products = crop.fertilizer_products.kg_acre;
    const fertilizer = document.createElement("small");
    fertilizer.textContent = `kg/acre: urea ${products.urea}, DAP ${products.dap}, MOP ${products.mop}`;

    card.append(title, meta, fertilizer);
    cropSummary.append(card);
  }
}

function updateAssistantMessage(text) {
  if (!activeAssistantMessage) {
    activeAssistantMessage = appendMessage("assistant", "");
  }
  activeAssistantMessage.textContent = text;
  transcript.scrollTop = transcript.scrollHeight;
}

function logEvent(message) {
  const node = document.createElement("div");
  node.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  eventLog.prepend(node);
}

function setStatus(text, state) {
  statusText.textContent = text;
  statusDot.classList.toggle("live", state === "live");
  statusDot.classList.toggle("error", state === "error");
}

function setControlsEnabled(enabled) {
  disconnectButton.disabled = !enabled;
  readSensorButton.disabled = !enabled;
  mockButton.disabled = !enabled;
  textInput.disabled = !enabled;
  textSubmitButton.disabled = !enabled;
}
