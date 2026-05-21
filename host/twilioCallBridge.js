import "dotenv/config";

import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";
import { URL } from "node:url";

import express from "express";
import WebSocket from "ws";
import { WebSocketServer } from "ws";

import { Esp32SerialTool } from "./esp32SerialTool.js";
import { REALTIME_INSTRUCTIONS } from "./realtimePrompt.js";
import { REALTIME_TOOLS } from "./realtimeTools.js";
import { enrichWithStcrRanking, rankCropsFromNpk } from "./stcrEngine.js";
import { fetchRealtimeWeather } from "./weatherSearchTool.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.REALTIME_MODEL || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-1.5";
const VOICE = process.env.REALTIME_VOICE || process.env.OPENAI_REALTIME_VOICE || "marin";
const TRANSCRIPTION_MODEL = process.env.REALTIME_TRANSCRIPTION_MODEL || "gpt-4o-transcribe";
const TRANSCRIPTION_LANGUAGE = process.env.TRANSCRIPTION_LANGUAGE || "en";
const SERVER_HOST = process.env.TWILIO_HOST || "0.0.0.0";
const SERVER_PORT = Number(process.env.TWILIO_PORT || process.env.PORT || 3000);
const SERIAL_PORT = process.env.ESP32_SERIAL_PORT || "/dev/cu.usbmodem1101";
const SERIAL_BAUD = Number(process.env.ESP32_SERIAL_BAUD || 115200);
const TELEPHONY_AUDIO_FORMAT = { type: "audio/pcmu" };

const esp32 = new Esp32SerialTool({
  portPath: SERIAL_PORT,
  baudRate: SERIAL_BAUD,
});

main().catch(async (error) => {
  console.error(`Fatal: ${error.message}`);
  await esp32.close();
  process.exitCode = 1;
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY in your environment or .env file.");
  }
  if (!args.toNumber && !args.noPlaceCall) {
    throw new Error("Pass --to-number +15551234567 to place an outbound Twilio call.");
  }

  const publicBaseUrl = (args.publicUrl || process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  if (!publicBaseUrl) {
    throw new Error("Set PUBLIC_BASE_URL or pass --public-url with an HTTPS URL Twilio can reach.");
  }
  if (!publicBaseUrl.startsWith("https://")) {
    throw new Error("PUBLIC_BASE_URL/--public-url must be an HTTPS URL that Twilio can reach.");
  }

  const capturedNpk = await captureInitialNpk(args);
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const callId = crypto.randomUUID();
  const callContext = {
    callId,
    toNumber: args.toNumber || "",
    publicBaseUrl,
    capturedNpk,
  };

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      model: MODEL,
      voice: VOICE,
      serial: {
        port: SERIAL_PORT,
        baud: SERIAL_BAUD,
        open: Boolean(esp32.port?.isOpen),
      },
      captured_npk: capturedNpk,
    });
  });

  app.all("/twilio/voice", (request, response) => {
    const url = new URL(request.originalUrl, publicBaseUrl);
    const toNumber = url.searchParams.get("to_number") || callContext.toNumber;
    const streamUrl = `${publicBaseUrl.replace(/^http/, "ws")}/twilio/media?call_id=${encodeURIComponent(callId)}`;
    console.log(`Twilio voice webhook: ${request.method} stream=${streamUrl}`);
    response.type("application/xml").send(twimlStreamResponse(streamUrl, toNumber));
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname !== "/twilio/media") {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (websocket) => {
      wss.emit("connection", websocket, request);
    });
  });

  wss.on("connection", (twilioWs) => {
    bridgeTwilioToRealtime(twilioWs, callContext).catch((error) => {
      console.error(`Twilio bridge error: ${error.message}`);
      tryClose(twilioWs);
    });
  });

  await listen(server, args.host, args.port);
  console.log(`Twilio webhook server: http://${args.host}:${args.port}/twilio/voice`);
  console.log(`Public voice URL: ${publicVoiceUrl(publicBaseUrl, callId, args.toNumber)}`);
  console.log(`Captured NPK before dialing: ${summarizeNpkForLog(capturedNpk)}`);

  if (!args.noPlaceCall && args.toNumber) {
    const result = await createOutboundCall({
      toNumber: args.toNumber,
      publicBaseUrl,
      callId,
    });
    console.log(`Twilio outbound call started: sid=${result.sid} status=${result.status}`);
  }

  process.on("SIGINT", () => shutdown(server));
  process.on("SIGTERM", () => shutdown(server));
}

async function captureInitialNpk(args) {
  if (args.mockNpk) {
    const [nitrogenKgHa, phosphorusKgHa, potassiumKgHa] = args.mockNpk.split(",").map(Number);
    return rankCropsFromNpk({ nitrogenKgHa, phosphorusKgHa, potassiumKgHa });
  }

  console.log(`Reading live NPK from ESP32 on ${SERIAL_PORT} @ ${SERIAL_BAUD} before dialing...`);
  return enrichWithStcrRanking(await esp32.readNpkSensor());
}

async function bridgeTwilioToRealtime(twilioWs, context) {
  const openaiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`, {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    maxPayload: 0,
  });
  let streamSid = "";
  let callSid = "";
  let openingSent = false;
  let responseText = "";
  let audioChunksSent = 0;
  const loggedRealtimeEvents = new Set();
  const pendingInputAudio = [];
  let realtimeReady = false;
  let twilioStarted = false;

  twilioWs.on("message", (data) => {
    const event = JSON.parse(data.toString());
    if (event.streamSid && !streamSid) {
      streamSid = event.streamSid;
      console.log(`Twilio stream recovered from ${event.event}: stream=${streamSid}`);
    }
    if (event.event === "start") {
      twilioStarted = true;
      streamSid = event.start?.streamSid || "";
      callSid = event.start?.callSid || "";
      console.log(`Twilio media started: call=${callSid} stream=${streamSid}`);
      sendOpeningIfReady();
      return;
    }

    if (event.event === "media" && event.media?.payload) {
      if (!realtimeReady) {
        pendingInputAudio.push(event.media.payload);
        return;
      }
      sendRealtime(openaiWs, inputAudioAppendEvent(event.media.payload));
      return;
    }

    if (event.event === "stop") {
      console.log("Twilio media stopped.");
      sendRealtime(openaiWs, { type: "input_audio_buffer.commit" });
      tryClose(openaiWs);
    }
  });

  openaiWs.on("message", async (data) => {
    const event = JSON.parse(data.toString());
    if (!loggedRealtimeEvents.has(event.type)) {
      loggedRealtimeEvents.add(event.type);
      console.log(`Realtime event: ${event.type}`);
    }
    if ((event.type === "response.output_audio.delta" || event.type === "response.audio.delta") && event.delta) {
      if (!streamSid) {
        console.warn("Dropping assistant audio because Twilio streamSid is not known yet.");
        return;
      }
      audioChunksSent += 1;
      twilioWs.send(
        JSON.stringify({
          event: "media",
          streamSid,
          media: { payload: event.delta },
        }),
      );
      if (audioChunksSent === 1) {
        console.log("Streaming assistant audio to Twilio...");
      }
      return;
    }

    if (event.type === "input_audio_buffer.speech_started" && streamSid) {
      twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
      console.log(`Caller: ${event.transcript}`);
      return;
    }

    if (event.type === "response.output_audio_transcript.delta" && event.delta) {
      responseText += event.delta;
      process.stdout.write(event.delta);
      return;
    }

    if (event.type === "response.done") {
      if (responseText) {
        process.stdout.write("\n");
        responseText = "";
      }
      await handleResponseDone(openaiWs, event.response);
      return;
    }

    if (event.type === "error") {
      console.error(`Realtime error: ${JSON.stringify(event.error)}`);
    }
  });

  await waitForOpen(openaiWs);
  sendRealtime(openaiWs, {
    type: "session.update",
    session: {
      type: "realtime",
      model: MODEL,
      instructions: buildTelephonyInstructions(context),
      output_modalities: ["audio"],
      tools: REALTIME_TOOLS,
      tool_choice: "auto",
      audio: {
        input: {
          format: TELEPHONY_AUDIO_FORMAT,
          transcription: {
            model: TRANSCRIPTION_MODEL,
            language: TRANSCRIPTION_LANGUAGE,
            prompt: "",
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
        output: {
          format: TELEPHONY_AUDIO_FORMAT,
          voice: VOICE,
        },
      },
    },
  });
  realtimeReady = true;
  for (const payload of pendingInputAudio.splice(0)) {
    sendRealtime(openaiWs, inputAudioAppendEvent(payload));
  }
  sendOpeningIfReady();

  twilioWs.on("close", () => tryClose(openaiWs));
  openaiWs.on("close", () => tryClose(twilioWs));
  openaiWs.on("error", (error) => console.error(`Realtime socket error: ${error.message}`));

  function sendOpeningIfReady() {
    if (!realtimeReady || !twilioStarted || openingSent) {
      return;
    }
    openingSent = true;
    sendRealtime(openaiWs, {
      type: "response.create",
      response: {
        instructions:
          "Start the call now. Greet the farmer respectfully in a professional, kind public-service tone. Use a warm voice with brief pauses. Say you captured the live soil NPK reading, give only a very brief summary, then gently ask what crop or fertilizer question they want help with. Do not say farmer friend.",
      },
    });
  }
}

async function handleResponseDone(openaiWs, response) {
  const functionCalls = (response?.output || []).filter((item) => item.type === "function_call");
  if (functionCalls.length === 0) {
    return;
  }

  for (const call of functionCalls) {
    const result = await runToolCall(call);
    sendRealtime(openaiWs, {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      },
    });
  }

  sendRealtime(openaiWs, {
    type: "response.create",
    response: {},
  });
}

async function runToolCall(call) {
  let args = {};
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch (error) {
    return { ok: false, error: `Invalid tool arguments: ${error.message}` };
  }

  try {
    if (call.name === "read_npk_sensor") {
      return enrichWithStcrRanking(await esp32.readNpkSensor());
    }
    if (call.name === "mock_npk_sensor") {
      return enrichWithStcrRanking(await esp32.mockNpk(args));
    }
    if (call.name === "rank_crops_from_npk") {
      return rankCropsFromNpk(args);
    }
    if (call.name === "fetch_realtime_weather") {
      return fetchRealtimeWeather(args);
    }
    if (call.name === "get_npk_calibration") {
      return esp32.getCalibration();
    }
    if (call.name === "reset_npk_calibration") {
      return esp32.resetCalibration();
    }
    if (call.name === "set_npk_calibration") {
      return esp32.setCalibration(args);
    }
    if (call.name === "set_npk_offset_calibration") {
      return esp32.setOffsetCalibration(args);
    }
    if (call.name === "set_npk_two_point_calibration") {
      return esp32.setTwoPointCalibration(args);
    }
    return { ok: false, error: `Unknown tool: ${call.name}` };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function createOutboundCall({ toNumber, publicBaseUrl, callId }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER || "";
  const missing = [
    ["TWILIO_ACCOUNT_SID", accountSid],
    ["TWILIO_AUTH_TOKEN", authToken],
    ["TWILIO_FROM_NUMBER", fromNumber],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing Twilio configuration: ${missing.join(", ")}`);
  }

  const body = new URLSearchParams({
    To: toNumber,
    From: fromNumber,
    Url: publicVoiceUrl(publicBaseUrl, callId, toNumber),
    Method: "POST",
  });
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const payload = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw new Error(`Twilio call request failed with HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function buildTelephonyInstructions(context) {
  return `${REALTIME_INSTRUCTIONS}

Outbound phone-call context:
- You are speaking on a Twilio outbound voice call to ${context.toNumber || "the configured recipient"}.
- A live NPK reading was captured immediately before this call. Treat this captured reading as available context for your opening answer.
- Captured live NPK summary: ${JSON.stringify(compactNpkForPrompt(context.capturedNpk))}
- If the caller asks for a fresh current reading, call read_npk_sensor again.
- Keep each spoken turn very short and natural for a phone call, usually 2 to 4 sentences.
- Use warm voice variation, brief pauses, and gentle emphasis on the key advice.
- Do not say "farmer friend".`;
}

function twimlStreamResponse(streamUrl, toNumber) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(streamUrl)}">
      <Parameter name="to_number" value="${escapeXml(toNumber || "")}" />
    </Stream>
  </Connect>
</Response>`;
}

function publicVoiceUrl(publicBaseUrl, callId, toNumber) {
  const url = new URL("/twilio/voice", publicBaseUrl);
  url.searchParams.set("call_id", callId);
  if (toNumber) {
    url.searchParams.set("to_number", toNumber);
  }
  return url.toString();
}

function parseArgs(argv) {
  const args = {
    host: SERVER_HOST,
    port: SERVER_PORT,
    publicUrl: process.env.PUBLIC_BASE_URL || "",
    toNumber: process.env.TWILIO_TO_NUMBER || "",
    noPlaceCall: isTruthy(process.env.TWILIO_NO_PLACE_CALL),
    mockNpk: process.env.TWILIO_MOCK_NPK || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--host") {
      args.host = argv[++index];
    } else if (arg === "--port") {
      args.port = Number(argv[++index]);
    } else if (arg === "--public-url") {
      args.publicUrl = argv[++index];
    } else if (arg === "--to-number") {
      args.toNumber = argv[++index];
    } else if (arg === "--no-place-call") {
      args.noPlaceCall = true;
    } else if (arg === "--mock-npk") {
      args.mockNpk = argv[++index];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.port) || args.port <= 0) {
    throw new Error("--port must be a positive number.");
  }
  if (args.mockNpk && !/^\d+(\.\d+)?,\d+(\.\d+)?,\d+(\.\d+)?$/.test(args.mockNpk)) {
    throw new Error("--mock-npk must be formatted as N,P,K, for example 120,30,200.");
  }
  return args;
}

function printHelp() {
  console.log(`Usage: npm run twilio:call

Options:
  --to-number <phone>    Overrides TWILIO_TO_NUMBER.
  --public-url <url>     Overrides PUBLIC_BASE_URL.
  --host <host>          Overrides TWILIO_HOST.
  --port <port>          Overrides TWILIO_PORT/PORT.
  --no-place-call        Overrides TWILIO_NO_PLACE_CALL=true.
  --mock-npk <N,P,K>     Overrides TWILIO_MOCK_NPK. Example: 120,30,200.`);
}

function sendRealtime(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function inputAudioAppendEvent(audio) {
  return {
    type: "input_audio_buffer.append",
    audio,
  };
}

function waitForOpen(socket) {
  if (socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function listen(server, host, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
}

async function shutdown(server) {
  server.close();
  await esp32.close();
  process.exit(0);
}

function tryClose(ws) {
  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.close();
  }
}

function summarizeNpkForLog(payload) {
  if (!payload?.ok) {
    return JSON.stringify(payload);
  }
  const npk = payload.stcr_multi_crop?.input_npk_kg_ha || payload.sensor || {};
  const topCrop = payload.stcr_multi_crop?.top_crop;
  return `N=${npk.n_kg_ha} P=${npk.p_kg_ha} K=${npk.k_kg_ha}; top=${topCrop?.crop || "n/a"} ${topCrop?.confidence_percent ?? ""}%`;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function compactNpkForPrompt(payload) {
  if (!payload?.ok) {
    return payload;
  }

  const ranking = payload.stcr_multi_crop || {};
  const topCrops = (ranking.ranked_crops || []).slice(0, 3).map((crop) => ({
    crop: crop.crop,
    variant: crop.variant,
    confidence_percent: crop.confidence_percent,
    fertilizer_products_kg_acre: crop.fertilizer_products?.kg_acre,
  }));

  return {
    ok: true,
    npk_kg_ha: ranking.input_npk_kg_ha || payload.sensor,
    soil_classification: payload.soil_classification,
    top_crops: topCrops,
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
