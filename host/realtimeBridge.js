import "dotenv/config";

import process from "node:process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import WebSocket from "ws";

import { Esp32SerialTool } from "./esp32SerialTool.js";
import { REALTIME_INSTRUCTIONS } from "./realtimePrompt.js";
import { REALTIME_TOOLS } from "./realtimeTools.js";
import { enrichWithStcrRanking, rankCropsFromNpk } from "./stcrEngine.js";
import { fetchRealtimeWeather } from "./weatherSearchTool.js";

const MODEL = process.env.REALTIME_MODEL || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-1.5";
const SERIAL_PORT = process.env.ESP32_SERIAL_PORT || "/dev/cu.usbmodem1101";
const SERIAL_BAUD = Number(process.env.ESP32_SERIAL_BAUD || 115200);

const esp32 = new Esp32SerialTool({
  portPath: SERIAL_PORT,
  baudRate: SERIAL_BAUD,
});

let ws;
let currentResponseText = "";
let rl;

main().catch((error) => {
  console.error(`Fatal: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY in your environment or .env file.");
  }

  await esp32.open();
  console.log(`ESP32 serial ready on ${SERIAL_PORT} @ ${SERIAL_BAUD}.`);

  ws = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(MODEL)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  ws.on("open", () => {
    console.log(`Connected to OpenAI Realtime model: ${MODEL}`);
    send({
      type: "session.update",
      session: {
        type: "realtime",
        model: MODEL,
        instructions: REALTIME_INSTRUCTIONS,
        output_modalities: ["text"],
        tools: REALTIME_TOOLS,
        tool_choice: "auto",
      },
    });
  });

  ws.on("message", (data) => handleRealtimeEvent(JSON.parse(data.toString())));
  ws.on("close", () => console.log("\nRealtime socket closed."));
  ws.on("error", (error) => console.error(`Realtime socket error: ${error.message}`));

  await waitForOpen(ws);
  await startCli();
}

async function startCli() {
  rl = readline.createInterface({ input, output });
  console.log("\nAsk about the soil. Examples:");
  console.log("  Can I grow rice with the current sensor reading?");
  console.log("  Use mock N=120 P=30 K=200 and explain the fertilizer advice.");
  console.log("  Type /exit to quit.\n");

  while (true) {
    const text = (await rl.question("> ")).trim();
    if (text === "/exit") {
      break;
    }
    if (!text) {
      continue;
    }
    askRealtime(text);
  }

  rl.close();
  ws.close();
  await esp32.close();
}

function askRealtime(text) {
  currentResponseText = "";
  send({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text }],
    },
  });
  send({
    type: "response.create",
    response: {
      output_modalities: ["text"],
    },
  });
}

async function handleRealtimeEvent(event) {
  switch (event.type) {
    case "session.created":
    case "session.updated":
      return;

    case "response.output_text.delta":
      currentResponseText += event.delta;
      process.stdout.write(event.delta);
      return;

    case "response.done":
      await handleResponseDone(event.response);
      return;

    case "error":
      console.error(`\nRealtime error: ${JSON.stringify(event.error)}`);
      return;

    default:
      return;
  }
}

async function handleResponseDone(response) {
  const functionCalls = (response?.output || []).filter((item) => item.type === "function_call");
  if (functionCalls.length === 0) {
    if (currentResponseText) {
      process.stdout.write("\n");
    }
    return;
  }

  for (const call of functionCalls) {
    const result = await runToolCall(call);
    send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      },
    });
  }

  currentResponseText = "";
  send({
    type: "response.create",
    response: {
      output_modalities: ["text"],
    },
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

function send(payload) {
  ws.send(JSON.stringify(payload));
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
