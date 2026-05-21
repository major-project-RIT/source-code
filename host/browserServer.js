import "dotenv/config";

import express from "express";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Esp32SerialTool } from "./esp32SerialTool.js";
import { REALTIME_INSTRUCTIONS } from "./realtimePrompt.js";
import { REALTIME_TOOLS } from "./realtimeTools.js";
import { enrichWithStcrRanking, rankCropsFromNpk } from "./stcrEngine.js";
import { fetchRealtimeWeather } from "./weatherSearchTool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.REALTIME_MODEL || process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-1.5";
const VOICE = process.env.REALTIME_VOICE || process.env.OPENAI_REALTIME_VOICE || "marin";
const SERVER_PORT = Number(process.env.PORT || 3000);
const SERIAL_PORT = process.env.ESP32_SERIAL_PORT || "/dev/cu.usbmodem1101";
const SERIAL_BAUD = Number(process.env.ESP32_SERIAL_BAUD || 115200);

if (!OPENAI_API_KEY) {
  throw new Error("Set OPENAI_API_KEY in .env before starting the browser server.");
}

const esp32 = new Esp32SerialTool({
  portPath: SERIAL_PORT,
  baudRate: SERIAL_BAUD,
});

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(projectRoot, "public")));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    model: MODEL,
    voice: VOICE,
    serial: {
      port: SERIAL_PORT,
      baud: SERIAL_BAUD,
      open: Boolean(esp32.port?.isOpen),
    },
  });
});

app.post("/api/realtime/client-secret", async (_request, response) => {
  try {
    const tokenResponse = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expires_after: {
          anchor: "created_at",
          seconds: 600,
        },
        session: {
          type: "realtime",
          model: MODEL,
          instructions: REALTIME_INSTRUCTIONS,
          output_modalities: ["audio"],
          audio: {
            input: {
              turn_detection: {
                type: "server_vad",
              },
            },
            output: {
              voice: VOICE,
            },
          },
          tools: REALTIME_TOOLS,
          tool_choice: "auto",
        },
      }),
    });

    const payload = await tokenResponse.json();
    if (!tokenResponse.ok) {
      response.status(tokenResponse.status).json(payload);
      return;
    }

    response.json(payload);
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/read-npk", async (_request, response) => {
  try {
    const result = await runSerialCommand(() => esp32.readNpkSensor());
    response.json(enrichWithStcrRanking(result));
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/mock-npk", async (request, response) => {
  try {
    const result = await runSerialCommand(() => esp32.mockNpk(request.body || {}));
    response.json(enrichWithStcrRanking(result));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/rank-crops", async (request, response) => {
  try {
    response.json(rankCropsFromNpk(request.body || {}));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/calibration/show", async (_request, response) => {
  try {
    response.json(await runSerialCommand(() => esp32.getCalibration()));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/calibration/reset", async (_request, response) => {
  try {
    response.json(await runSerialCommand(() => esp32.resetCalibration()));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/calibration/set", async (request, response) => {
  try {
    response.json(await runSerialCommand(() => esp32.setCalibration(request.body || {})));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/calibration/offset", async (request, response) => {
  try {
    response.json(await runSerialCommand(() => esp32.setOffsetCalibration(request.body || {})));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/calibration/two-point", async (request, response) => {
  try {
    response.json(await runSerialCommand(() => esp32.setTwoPointCalibration(request.body || {})));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

app.post("/api/tools/weather", async (request, response) => {
  try {
    response.json(await fetchRealtimeWeather(request.body || {}));
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error.message,
    });
  }
});

const server = app.listen(SERVER_PORT, () => {
  console.log(`Browser app: http://localhost:${SERVER_PORT}`);
  console.log(`Realtime model: ${MODEL}`);
  console.log(`ESP32 serial: ${SERIAL_PORT} @ ${SERIAL_BAUD}`);
  console.log("Note: serial opens only while a sensor/calibration tool request is running.");
});
const keepAlive = setInterval(() => {}, 1 << 30);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function shutdown() {
  clearInterval(keepAlive);
  await esp32.close();
  server.close();
  process.exit(0);
}

async function runSerialCommand(command) {
  try {
    return await command();
  } finally {
    await esp32.close();
  }
}
