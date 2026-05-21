# Project Architecture — Intern's Guide

> **Soil NPK Sensor + AI Crop Advisory System**
> ESP32-S3 → Node.js → OpenAI GPT-4o Realtime → Browser Voice UI

---

## Table of Contents

1. [What Are We Building?](#1-what-are-we-building)
2. [The Big Picture — 4-Tier Architecture](#2-the-big-picture--4-tier-architecture)
3. [Tier 1: The Physical Sensor](#3-tier-1-the-physical-sensor)
4. [Tier 2: ESP32-S3 Firmware](#4-tier-2-esp32-s3-firmware)
5. [Tier 3: Node.js Host Layer](#5-tier-3-nodejs-host-layer)
6. [Tier 4: Browser + OpenAI](#6-tier-4-browser--openai)
7. [The Voice Query — Full Data Flow](#7-the-voice-query--full-data-flow)
8. [STCR Formula Engine — How It Works](#8-stcr-formula-engine--how-it-works)
9. [Modbus RTU — The Sensor Language](#9-modbus-rtu--the-sensor-language)
10. [Key Files Cheat Sheet](#10-key-files-cheat-sheet)

---

## 1. What Are We Building?

A farmer or agronomist talks to a web app. They say:

> *"Can I grow rice in this soil?"*

The web app talks to OpenAI, which decides to call a **tool** that reads a real soil sensor buried in the field. The sensor sends NPK (Nitrogen, Phosphorus, Potassium) readings to an ESP32 microcontroller over RS485 wires. The ESP32 computes a fertilizer recipe using **STCR equations** (a government-recommended agronomy formula). The result goes back through the chain, and the farmer hears:

> *"Your soil has low nitrogen. I recommend 120 kg of Urea per acre. Rice confidence: 85%."*

**No internet? No problem.** The ESP32 can compute the rice recommendation entirely offline. The internet (Node.js host + OpenAI) is only needed for voice conversation and multi-crop ranking.

---

## 2. The Big Picture — 4-Tier Architecture

```
                            TIER 4 (Browser + AI)
  .─────────────────────────────────────────────────────────────────────.
  |                                                                     |
  |   ┌─────────────────────────────────────────────────────────────┐   |
  |   │                    BROWSER (public/ )                       │   |
  |   │                                                             │   |
  |   │  ┌──────────────┐     ┌──────────────────┐                 │   |
  |   │  │  Microphone   │────▶│  WebRTC Peer     │                 │   |
  |   │  │  (getUserMed.)│     │  Connection       │                 │   |
  |   │  └──────────────┘     │                  │                 │   |
  |   │  ┌──────────────┐     │  DataChannel ◀────┼── tool calls    │   |
  |   │  │  Speaker      │◀────│  (oai-events)     │                 │   |
  |   │  └──────────────┘     └────────┬─────────┘                 │   |
  |   │                                │                           │   |
  |   │  ┌─────────────────────────────▼─────────────────────────┐ │   |
  |   │  │              app.js                                    │ │   |
  |   │  │  • connectRealtime() → WebRTC to OpenAI               │ │   |
  |   │  │  • handleResponseDone() → REST call → send back       │ │   |
  |   │  │  • renderCropRanking() → DOM update                   │ │   |
  |   │  └───────────────────────────────────────────────────────┘ │   |
  |   └─────────────────────────────────────────────────────────────┘   |
  |                            │  REST (local)                          |
  |                            ▼                                        |
  |   ┌─────────────────────────────────────────────────────────────┐   |
  |   │             OPENAI GPT-4o Realtime API                      │   |
  |   │  (gpt-realtime-1.5)                                        │   |
  |   │  • WebRTC audio in/out                                     │   |
  |   │  • Function calling (read_npk_sensor, rank_crops, etc.)    │   |
  |   │  • Generates speech + structured tool calls                │   |
  |   └─────────────────────────────────────────────────────────────┘   |
  '─────────────────────────────────────────────────────────────────────'
                            ▲  WebSocket / WebRTC
                            │
  ──────────────────────────┼────────────────────────────────────────────
                            │          TIER 3 (Node.js Host)
  .─────────────────────────┼───────────────────────────────────────────.
  |                         ▼                                           |
  |   ┌─────────────────────────────────────────────────────────────┐   |
  |   │                 NODE.JS HOST (host/ )                       │   |
  |   │                                                             │   |
  |   │  ┌────────────────────┐      ┌──────────────────────────┐  │   |
  |   │  │ browserServer.js   │      │ realtimeBridge.js         │  │   |
  |   │  │ • Express server   │      │ • CLI-based bridge        │  │   |
  |   │  │ • REST API:        │      │ • stdin → WebSocket       │  │   |
  |   │  │   POST /client-secr│      │ • For debugging           │  │   |
  |   │  │   POST /read-npk   │      └──────────────────────────┘  │   |
  |   │  │   POST /mock-npk   │                                     │   |
  |   │  │   POST /rank-crops │      ┌──────────────────────────┐  │   |
  |   │  └────────┬───────────┘      │ realtimeTools.js          │  │   |
  |   │           │                  │ • OpenAI function defs    │  │   |
  |   │           │                  │   read_npk_sensor         │  │   |
  |   │           │                  │   mock_npk_sensor         │  │   |
  |   │           │                  │   rank_crops_from_npk     │  │   |
  |   │           │                  └──────────────────────────┘  │   |
  |   │           │                  ┌──────────────────────────┐  │   |
  |   │           │                  │ realtimePrompt.js         │  │   |
  |   │           │                  │ • System prompt for GPT   │  │   |
  |   │           │                  └──────────────────────────┘  │   |
  |   │           │                                                │   |
  |   │  ┌────────▼───────────────────────────────────────────┐   │   |
  |   │  │              esp32SerialTool.js                    │   │   |
  |   │  │  • Queue-based serial command execution            │   │   |
  |   │  │  • Writes "JSON\\r\\n" → reads JSON response       │   │   |
  |   │  │  • Promise chain → FIFO resolver                   │   │   |
  |   │  │  • 4-second timeout per command                    │   │   |
  |   │  └────────────────────────────────────────────────────┘   │   |
  |   │                                                             │   |
  |   │  ┌────────────────────┐      ┌──────────────────────────┐  │   |
  |   │  │  stcrEngine.js     │      │ stcrFormulaRegistry.js   │  │   |
  |   │  │  • enrichWithStcr()│      │ • 52 crop formula coeffs │  │   |
  |   │  │  • rankCrops()     │      │ • CORE (9 verified)      │  │   |
  |   │  │  • classifySoil()  │      │ • TNAU (43 from database)│  │   |
  |   │  │  • estimateProd()  │      │ • Per-crop: N,P,K coeffs │  │   |
  |   │  └────────────────────┘      └──────────────────────────┘  │   |
  |   └─────────────────────────────────────────────────────────────┘   |
  '─────────────────────────────────────────────────────────────────────'
                            │  USB Serial (CDC)
                            ▼
  ──────────────────────────────────────────────────────────────────────
                            TIER 2 (ESP32-S3 Firmware)
  .─────────────────────────────────────────────────────────────────────.
  |   ┌─────────────────────────────────────────────────────────────┐   |
  |   │                    ESP32-S3 (C++ Firmware)                  │   |
  |   │                                                             │   |
  |   │   main.cpp — Serial command loop:                           │   |
  |   │     "JSON"      → read sensor → print JSON                 │   |
  |   │     "READ_NPK"  → read sensor → print human + JSON         │   |
  |   │     "MOCK N P K"→ offline math test                        │   |
  |   │     "TARGET n"  → change rice target yield                 │   |
  |   │     "SCAN"      → brute-force baud/address/register scan   │   |
  |   │     "AUTO ON"   → auto-read every 5 seconds                │   |
  |   │                                                             │   |
  |   │  ┌──────────────────────────┐  ┌────────────────────────┐  │   |
  |   │  │ ModbusNpkSensor class    │  │ SoilRecommendationEng. │  │   |
  |   │  │ • begin(uart, pins)      │  │ • evaluateRice(npk)    │  │   |
  |   │  │ • readNpk(reg, &val)     │  │   FN=3.58T-0.57*SN    │  │   |
  |   │  │ • CRC16-Modbus           │  │   FP=1.71T-2.46*SP    │  │   |
  |   │  │ • RS485 direction ctrl   │  │   FK=1.48T-0.16*SK    │  │   |
  |   │  │ • Half-duplex timing     │  │ • scores, confidence   │  │   |
  |   │  └──────────────────────────┘  │ • urea/DAP/MOP kg/acre│  │   |
  |   │                                └────────────────────────┘  │   |
  |   └─────────────────────────────────────────────────────────────┘   |
  '─────────────────────────────────────────────────────────────────────'
                            │  UART2 (GPIO16-TX, GPIO17-RX)
                            │  RS485 Dir = GPIO4
                            ▼
  ──────────────────────────────────────────────────────────────────────
                            TIER 1 (Hardware)
  .─────────────────────────────────────────────────────────────────────.
  |                                                                     |
  |   ┌─────────────────────────────────────────────────────────────┐   |
  |   │              ZTS-3002-TR-NPK-N01 Soil Sensor                │   |
  |   │                                                             │   |
   \  │   ┌─────┐  ┌─────┐  ┌─────┐    Modbus RTU Slave ID = 0x01  │   /
    \ │   │  N  │  │  P  │  │  K  │    Baud = 4800                 │  /
     \│   │     │  │     │  │     │    Holding Regs 0x001E-0x0020  │ /  <-- IN THE GROUND
      │   └─────┘  └─────┘  └─────┘    RS485 A/B (differential)   │
      │                                                             │
      └─────────────────────────────────────────────────────────────┘
  '─────────────────────────────────────────────────────────────────────'
```

---

## 3. Tier 1: The Physical Sensor

This is a **ZTS-3002-TR-NPK-N01** — a probe you bury in soil. It measures:

| Nutrient | What It Means |
|----------|---------------|
| **N** (Nitrogen) | Leaf growth, green color |
| **P** (Phosphorus) | Root development, flowering |
| **K** (Potassium) | Disease resistance, fruit quality |

It speaks **Modbus RTU** over **RS485** (two differential data wires: A and B). Think of RS485 as a walkie-talkie channel — only one device talks at a time. The sensor is a **Modbus slave** at address `0x01`. The ESP32 is the **master**.

```
MODBUS REQUEST (ESP32 → Sensor):
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ 0x01   │ 0x03   │ 0x00   │ 0x1E   │ 0x00   │ 0x03   │  CRC   │  CRC   │
│ Slave  │ Func   │ Reg    │ Start  │  Count │  = 3   │  High  │  Low   │
│ Addr   │ Read   │ High   │  (30)  │        │        │        │        │
│        │ Hold   │        │        │        │        │        │        │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘

MODBUS RESPONSE (Sensor → ESP32):
┌────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┬────────┐
│ 0x01   │ 0x03   │ 0x06   │ N_hi   │ N_lo   │ P_hi   │ P_lo   │ K_hi   │ K_lo   │
│ Slave  │ Func   │ Byte   │ (Nitrogen value) │ (Phos.) │ (Pot.)  │        │        │
│ Addr   │ Echo   │ Count  │                   │         │         │        │        │
└────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┴────────┘
┌────────┬────────┐
│ CRC_hi │ CRC_lo │
└────────┴────────┘
```

The raw register values are **uint16** (0–65535). The sensor's datasheet maps these to mg/kg (ppm) soil NPK values.

---

## 4. Tier 2: ESP32-S3 Firmware

Written in **C++** using the Arduino framework, compiled with PlatformIO.

### 4a. The Command Loop

When the ESP32 boots, `main.cpp` sets up:
- **Serial** (USB CDC) at 115200 baud — to talk to the host computer
- **UART2** at 4800 baud — to talk to the NPK sensor via RS485
- A GPIO pin (`DIR_PIN = GPIO4`) that controls the RS485 transceiver direction

Then it enters a loop, waiting for commands:

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                      main.cpp LOOP                               │
  │                                                                  │
  │  Serial.available()? ──no──▶ wait...                             │
  │       │                                                          │
  │      yes                                                         │
  │       │                                                          │
  │  Read line from USB Serial                                       │
  │       │                                                          │
  │   ┌───┴───┬────────┬────────┬────────┬────────┬────────┐        │
  │   │ JSON  │READ_NPK│ MOCK   │ SCAN   │ TARGET │ AUTO   │        │
  │   │       │        │ N P K  │        │ <n>    │ ON/OFF │        │
  │   └───┬───┴───┬────┴───┬────┴───┬────┴───┬────┴───┬────┘        │
  │       │       │        │        │        │        │             │
  │   ┌───▼───┐ ┌─▼──┐ ┌──▼───┐ ┌──▼──┐ ┌───▼──┐ ┌──▼───┐        │
  │   │Read   │ │Read│ │Use   │ │Brute│ │Change│ │Toggle│        │
  │   │sensor │ │sens│ │typed │ │force │ │target│ │auto  │        │
  │   │→print │ │or  │ │values│ │scan  │ │yield │ │timer │        │
  │   │JSON   │ │+hum│ │→eval │ │all   │ │      │ │      │        │
  │   │       │ │    │ │rice  │ │bauds │ │      │ │      │        │
  │   └───────┘ └────┘ └──────┘ └──────┘ └──────┘ └──────┘        │
  │                                                                  │
  │  Every output is either:                                         │
  │    • A human-readable summary line                               │
  │    • A JSON line starting with "{"                               │
  │    • An error line (for unknown commands, CRC failures, etc.)    │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

### 4b. The Modbus Driver (`modbus_npk_sensor.h`)

This is a **from-scratch** Modbus RTU implementation (no library dependency). It implements:

```
ModbusNpkSensor::readHoldingRegisters(slaveAddr, startReg, count, &result)
│
├─ 1. Set DIR_PIN HIGH → ESP32 starts transmitting
├─ 2. Build Modbus frame in a byte buffer:
│     [slave_addr] [func_code=0x03] [reg_hi] [reg_lo] [count_hi] [count_lo] [CRC_lo] [CRC_hi]
├─ 3. Write buffer to UART2
├─ 4. Wait for transmission to finish (delayMicroseconds)
├─ 5. Set DIR_PIN LOW → ESP32 listens for reply
├─ 6. Read bytes from UART2 with 2ms timeout between bytes:
│     - If gap > 2ms → frame is complete (Modbus RTU convention)
├─ 7. Validate:
│     - Slave address matches
│     - Function code matches (or error bit set)
│     - CRC16 matches computed CRC
├─ 8. Extract register values (big-endian: hi byte first)
└─ 9. Return true (ok) or false (error)
```

### 4c. The STCR Engine (`soil_recommendation.h`)

**STCR** = Soil Test Crop Response — a government-recommended math formula for calculating how much fertilizer to apply.

For rice (Telangana region), the equations hardcoded on the ESP32 are:

```
FN = 3.58 × TARGET_YIELD  -  0.57 × SOIL_NITROGEN   (kg N/ha)
FP = 1.71 × TARGET_YIELD  -  2.46 × SOIL_PHOSPHORUS (kg P/ha)
FK = 1.48 × TARGET_YIELD  -  0.16 × SOIL_POTASSIUM  (kg K/ha)
```

Then the firmware computes:

```
score_N = 1  -  (FN / max_N)
score_P = 1  -  (FP / max_P)
score_K = 1  -  (FK / max_K)

confidence = 0.4 × score_N  +  0.3 × score_P  +  0.3 × score_K

urea_kg_per_acre = (FN / 0.46) × 0.404686    (urea = 46% N)
dap_kg_per_acre  = (FP / 0.46) × 0.404686    (DAP = 46% P2O5)
mop_kg_per_acre  = (FK / 0.60) × 0.404686    (MOP = 60% K2O)
```

The `0.404686` converts kg/hectare to kg/acre (1 hectare = 2.471 acres).

---

## 5. Tier 3: Node.js Host Layer

### 5a. The Serial Bridge (`esp32SerialTool.js`)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      esp32SerialTool.js                              │
│                                                                     │
│  Key pattern: Command Queue + FIFO Promise Resolver                 │
│                                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │ Command  │    │ Command  │    │ Command  │   Queue (array)      │
│  │ "JSON"   │───▶│ "TARGET  │───▶│ "HELP"   │                      │
│  │ promise1 │    │  80"     │    │ promise3 │                      │
│  └──────────┘    │ promise2 │    └──────────┘                      │
│                  └──────────┘                                      │
│       │               │               │                            │
│       ▼               ▼               ▼                            │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  SerialPort.write(command + "\\r\\n")                     │      │
│  │  → Lines arrive asynchronously:                          │      │
│  │    "NPK Sensor: N=120 mg/kg P=30 mg/kg K=200 mg/kg"    │      │
│  │    "{"ok":true,"sensor":{"n":120,...},"rice":{...}}"     │      │
│  │    (host ignores non-JSON lines)                         │      │
│  │                                                          │      │
│  │  When a line starts with "{":                            │      │
│  │    → Parse JSON                                          │      │
│  │    → Resolve the oldest pending promise with this object │      │
│  │    → Shift the queue                                     │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
│  Each command has a 4-second timeout. If no JSON arrives in time,  │
│  the promise rejects with an error.                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5b. The Express Server (`browserServer.js`)

```
┌────────────────────────────────────────────────────────────────────┐
│                    browserServer.js                                 │
│                                                                    │
│  Express Server (default port 3000)                                │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Static files:  GET / → public/index.html                    │  │
│  │                  GET /app.js → public/app.js                 │  │
│  │                  GET /styles.css → public/styles.css         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  REST Endpoints:                                              │  │
│  │                                                               │  │
│  │  GET  /api/health                                             │  │
│  │       → { status: "ok", uptime, sensorConnected }            │  │
│  │                                                               │  │
│  │  POST /api/realtime/client-secret                             │  │
│  │       → Calls OpenAI POST https://api.openai.com/v1/realtime/ │  │
│  │         /sessions with model=gpt-realtime-1.5                 │  │
│  │       → Returns { client_secret: { value: "ek_...", ... } }  │  │
│  │       → Key NEVER leaves server                               │  │
│  │                                                               │  │
│  │  POST /api/tools/read-npk                                     │  │
│  │       → esp32SerialTool.send("JSON")                          │  │
│  │       → enrichWithStcrRanking(esp32Result)                    │  │
│  │       → Return enriched JSON                                  │  │
│  │                                                               │  │
│  │  POST /api/tools/mock-npk { n, p, k }                         │  │
│  │       → esp32SerialTool.send("MOCK n p k")                    │  │
│  │       → enrichWithStcrRanking(esp32Result)                    │  │
│  │       → Return enriched JSON                                  │  │
│  │                                                               │  │
│  │  POST /api/tools/rank-crops { n, p, k }                      │  │
│  │       → stcrEngine.rankCropsFromNpk(npk)                      │  │
│  │       → No ESP32 needed                                       │  │
│  │       → Return crop rankings                                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 5c. The STCR Ranking Engine (`stcrEngine.js` + `stcrFormulaRegistry.js`)

On the host side, we have **52 crop formulas**, not just rice. When the host enriches a sensor reading, it:

```
enrichWithStcrRanking(esp32Payload)
│
├─ 1. Extract NPK from payload.sensor
│     { n: 120, p: 30, k: 200 }
│
├─ 2. classifySoil(npk) → soil classification
│     N: <50=low, 50-100=medium, >100=high
│     P: <10=low, 10-25=medium, >25=high
│     K: <100=low, 100-200=medium, >200=high
│     → { n: "low", p: "medium", k: "high" }
│
├─ 3. For each of 52 formulas in the registry:
│     │
│     ├─ evaluateFormula(formula, npk, organic, targetOverride)
│     │     │
│     │     ├─ For N:  FN = target * coeff_T  -  soil_N * coeff_S  -  organic_N * coeff_O
│     │     ├─ For P:  FP = target * coeff_T  -  soil_P * coeff_S  -  organic_P * coeff_O
│     │     ├─ For K:  FK = target * coeff_T  -  soil_K * coeff_S  -  organic_K * coeff_O
│     │     ├─ Clamp each at 0 (can't need negative fertilizer)
│     │     │
│     │     ├─ gap_N = FN / max_N
│     │     ├─ gap_P = FP / max_P
│     │     ├─ gap_K = FK / max_K
│     │     │
│     │     ├─ total_gap = avg(gap_N, gap_P, gap_K)
│     │     │
│     │     └─ confidence = 100 × (1 - total_gap)
│     │
│     ├─ estimateProducts(FN, FP, FK) → urea/DAP/MOP kg/ha + kg/acre
│     │
│     └─ Return crop record with confidence, requirements, products
│
├─ 4. Sort all crops by confidence descending
│
├─ 5. Return enriched payload:
│     {
│       ok: true,
│       sensor: { n, p, k, ... },
│       rice: { ... },              ← from ESP32 (unchanged)
│       soil_classification: { n, p, k },
│       stcr_multi_crop: {
│         top_crop: "Rice (Telangana)",
│         ranked_crops: [ ...52 sorted... ],
│         formula_count: 52
│       }
│     }
│
└─ Return to caller (browser or CLI bridge)
```

### 5d. The CLI Bridge (`realtimeBridge.js`)

For debugging without a browser. Opens a WebSocket directly to OpenAI and lets you type prompts:

```
┌──────────────────────────────────────────────────────────────────┐
│                    realtimeBridge.js                              │
│                                                                  │
│  1. Connect to serial port (ESP32)                               │
│  2. Connect WebSocket to OpenAI Realtime API                     │
│  3. Send system prompt (realtimePrompt.js)                       │
│  4. Send tool definitions (realtimeTools.js)                     │
│  5. Loop:                                                        │
│       stdin → user message → ws.send to OpenAI                   │
│       ws receives events:                                        │
│         text_delta → print to stdout                             │
│         tool_call  → call esp32SerialTool → send result back     │
│                                                                  │
│  No microphone/speaker needed. Just text in, text out.           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Tier 4: Browser + OpenAI

### 6a. WebRTC Connection Flow

The browser connects directly to OpenAI using **WebRTC**, not WebSocket. This gives us low-latency two-way audio.

```
Browser (app.js)                              OpenAI Realtime API
     │                                              │
     │  POST /api/realtime/client-secret             │
     │─────────────────────────────────▶             │
     │  (Express server proxies to OpenAI)           │
     │◀─────────────────────────────────             │
     │  { client_secret: "ek_..." }                  │
     │                                              │
     │  Create RTCPeerConnection                     │
     │  Create DataChannel "oai-events"              │
     │  getUserMedia → mic stream                    │
     │  Create offer SDP                             │
     │                                              │
     │  POST https://api.openai.com/v1/realtime      │
     │  ?model=gpt-realtime-1.5 (with SDP offer)     │
     │────────────────────────────────────────────────▶
     │                                              │
     │◀────────────────────────────────────────────────
     │  SDP answer + ICE candidates                  │
     │                                              │
     │  Set remote description                       │
     │  ICE connection establishes                   │
     │                                              │
     │  ┌─── DataChannel ───┐  ┌─── Audio Tracks ──┐│
     │  │ session.update    │  │ mic → GPT         ││
     │  │ response.done     │  │ GPT → speaker     ││
     │  │ function_call     │  └───────────────────┘│
     │  │ conversation.item │                       │
     │  └───────────────────┘                       │
     │                                              │
```

### 6b. Tool Call Handling

When OpenAI decides it needs sensor data, this happens:

```
VOICE: "Can I grow rice in this soil?"
                    │
                    ▼
OpenAI: "Hmm, let me check the sensor."
  → Decides to call function: read_npk_sensor()
  → Sends event via DataChannel: {
      type: "response.done",
      response: {
        output: [{
          type: "function_call",
          name: "read_npk_sensor",
          call_id: "call_abc123",
          arguments: "{}"
        }]
      }
    }
                    │
                    ▼
app.js handleResponseDone()
  → Extracts function_call
  → POSTs to /api/tools/read-npk
                    │
                    ▼
Express server → esp32SerialTool.send("JSON")
  → ESP32 reads sensor → returns JSON
  → enrichWithStcrRanking(payload) → 52 crops ranked
  → Returns to browser
                    │
                    ▼
app.js sends DataChannel message:
  {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: "call_abc123",
      output: "{ \"ok\":true, \"sensor\":{...}, \"rice\":{...}, ... }"
    }
  }

  {
    type: "response.create"
  }
                    │
                    ▼
OpenAI generates audio response:
  "Your soil has low nitrogen at 120 kg/ha, ...
   Rice confidence is 85%. Recommended: 120 kg urea per acre..."
                    │
                    ▼
Browser plays audio via WebRTC audio track
Browser renders soil_classification + top 5 crop cards
```

---

## 7. The Voice Query — Full Data Flow

Here's the complete end-to-end journey for a single user question:

```
User says: "What can I grow here?"
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. MICROPHONE → Browser gets audio via getUserMedia()                   │
│    Audio stream sent over WebRTC peer connection to OpenAI              │
├─────────────────────────────────────────────────────────────────────────┤
│ 2. OPENAI ASR → Speech-to-text → GPT-4o processes the question          │
│    "The user wants crop recommendations. I need soil NPK data."         │
│    → Calls function: read_npk_sensor()                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ 3. BROWSER receives "function_call" via DataChannel                     │
│    → POST /api/tools/read-npk to local Express server                   │
├─────────────────────────────────────────────────────────────────────────┤
│ 4. EXPRESS SERVER → esp32SerialTool.enqueueCommand("JSON")              │
│    → Promise queued, waiting for serial response                        │
├─────────────────────────────────────────────────────────────────────────┤
│ 5. ESP32 SERIAL → Receives "JSON\r\n"                                   │
│    → main.cpp matches "JSON" command                                    │
│    → Calls ModbusNpkSensor.readNpk()                                    │
├─────────────────────────────────────────────────────────────────────────┤
│ 6. MODBUS RS485 → ESP32 sets DIR=HIGH (transmit)                        │
│    → Sends: [0x01] [0x03] [0x00] [0x1E] [0x00] [0x03] [CRC] [CRC]     │
│    → Sets DIR=LOW (receive)                                             │
│    → Sensor replies with N, P, K register values + CRC                  │
│    → ESP32 validates CRC, extracts N=120, P=30, K=200                   │
├─────────────────────────────────────────────────────────────────────────┤
│ 7. ESP32 COMPUTES → SoilRecommendationEngine::evaluateRice()            │
│    FN=3.58*60 - 0.57*120 = 146.4 kg N/ha                              │
│    FP=1.71*60 - 2.46*30 = 28.8 kg P/ha                                │
│    FK=1.48*60 - 0.16*200 = 56.8 kg K/ha                               │
│    → confidence = 74%                                                   │
│    → urea/DAP/MOP in kg/acre                                            │
│    → Prints JSON line to USB Serial                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ 8. SERIAL PORT → esp32SerialTool reads JSON line                        │
│    → Resolves pending promise with parsed object                        │
│    → Express handler receives the result                                │
├─────────────────────────────────────────────────────────────────────────┤
│ 9. ENRICHMENT → stcrEngine.enrichWithStcrRanking(payload)               │
│    → classifySoil({n:120,p:30,k:200}) → {n:"high",p:"high",k:"high"}   │
│    → Runs 52 crop formulas, sorts by confidence                         │
│    → Top crops might be:                                                │
│      1. Rice (Telangana)    92%                                         │
│      2. Sugarcane (TNAU)    88%                                         │
│      3. Maize (TNAU)        81%                                         │
│      4. Cotton (TNAU)       76%                                         │
│      5. Groundnut (CORE)    72%                                         │
│    → Estimates products for each                                        │
│    → Returns enriched JSON                                              │
├─────────────────────────────────────────────────────────────────────────┤
│ 10. BROWSER receives enriched JSON                                      │
│     → Sends function_call_output via DataChannel                        │
│     → Sends response.create                                             │
├─────────────────────────────────────────────────────────────────────────┤
│ 11. OPENAI generates response:                                          │
│     "Your soil has high NPK levels. I recommend rice — 92% confidence.  │
│      Apply 120 kg urea, 65 kg DAP, and 50 kg MOP per acre..."          │
│     → Audio stream sent via WebRTC audio track                          │
├─────────────────────────────────────────────────────────────────────────┤
│ 12. BROWSER plays audio + updates UI:                                   │
│     → Soil class badges: N:high P:high K:high                          │
│     → Top-5 crop ranking cards with confidence bars                     │
│     → Fertilizer product breakdown for each                             │
│     → Raw JSON expandable section                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. STCR Formula Engine — How It Works

### What is STCR?

STCR stands for **Soil Test Crop Response**. It's a mathematical approach developed by ICAR (Indian Council of Agricultural Research) that answers:

> *"Given my soil's NPK levels, how much fertilizer does THIS specific crop need to reach THIS target yield?"*

The general formula per nutrient is:

```
Fertilizer_N = (Target_Yield × Coeff_T) - (Soil_N × Coeff_S) - (Organic_N × Coeff_O)

Where:
  Coeff_T = nutrient required per unit of yield (crop-specific)
  Coeff_S = soil nutrient contribution factor
  Coeff_O = organic matter contribution factor
```

### The 52 Formulas

The `stcrFormulaRegistry.js` contains formulas for 52 crop varieties. The formulas come from two sources:

```
CORE FORMULAS (9) — Verified from published studies:
┌─────────────────────┬──────────────────────────────────────────────┐
│ Crop                │ Source                                       │
├─────────────────────┼──────────────────────────────────────────────┤
│ Rice (Telangana)    │ STCR-Telangana rice experiment               │
│ Rice (Puducherry)   │ Puducherry region trial data                 │
│ Wheat (IARI)        │ Indian Agricultural Research Institute       │
│ Groundnut (AP)      │ Andhra Pradesh groundnut study               │
│ Bt Cotton (TN)      │ Tamil Nadu Bt cotton trial                  │
│ Kodo Millet (Ktk)   │ Karnataka kodo millet study                 │
│ Rice (TNAU)         │ TNAU STCR-IPNS database                     │
│ Maize (TNAU)        │ TNAU maize trial data                       │
│ Sugarcane (TNAU)    │ TNAU sugarcane trial data                   │
└─────────────────────┴──────────────────────────────────────────────┘

TNAU FORMULAS (43) — From TNAU Agrotech database:
  Rice (7 variants): IRR 20, ADT 36, ADT 39, CO 43, CO 51, White Ponni, BPT 5204
  Wheat (2): HD 2189, HW 2004
  Maize (3), Sorghum (2), Ragi (2), Pearl Millet, Little Millet
  Blackgram, Greengram
  Groundnut (3): TMV 2, JL 24, CO 3
  Sunflower, Gingelly
  Sugarcane (3): CO 86032, CO 419, CO 8021
  Cotton (2): MCU 5, LRA 5166
  Onion (2), Bhendi, Cabbage, Tomato, Brinjal, Beetroot, Radish
  Potato, Cauliflower, Carrot, Tapioca, Chilli, Turmeric
  Ashwagandha, Glory Lily, Chrysanthemum
```

### Formula Structure

Each formula entry in the registry looks like:

```
{
  id: "rice_telangana",
  name: "Rice (Telangana)",
  category: "CORE",
  source: "STCR-Telangana rice experiment",
  targetUnit: "q/ha",
  defaultTarget: 60,
  coefficients: {
    N: [3.58, 0.57, 0],    // [target_coeff, soil_coeff, organic_coeff]
    P: [1.71, 2.46, 0],
    K: [1.48, 0.16, 0]
  }
}
```

When evaluating, the engine does:

```
for each nutrient (N, P, K):
  requirement = target * coeff_T  -  soil_value * coeff_S  -  organic * coeff_O
  if requirement < 0: requirement = 0    (can't need negative fert)

  gap = requirement / max_requirement    (normalized 0-1)

total_gap = average(gap_N, gap_P, gap_K)
confidence = 100 * (1 - total_gap)
```

### Product Estimation

Once we know how many kg of N, P, K are needed, we convert to real fertilizer bags:

```
Fertilizer      Nutrient Content
─────────────────────────────────────
Urea            46% Nitrogen (N)
DAP (Diammonium  18% N + 46% P2O5
   Phosphate)
MOP (Muriate of  60% K2O
   Potash)

Products for Rice (Telangana), confidence 92%:
  ┌──────────┬─────────┬──────────┐
  │ Product  │ kg/ha   │ kg/acre  │
  ├──────────┼─────────┼──────────┤
  │ Urea     │ 318.5   │ 128.9    │
  │ DAP      │ 62.6    │ 25.3     │
  │ MOP      │ 94.7    │ 38.3     │
  └──────────┴─────────┴──────────┘
```

---

## 9. Modbus RTU — The Sensor Language

Modbus RTU is a **serial communication protocol** from the 1970s, still widely used in industrial sensors. Key points:

- **Master-slave**: Only the ESP32 (master) initiates communication. The sensor (slave) only replies.
- **Binary framing**: Each message has a strict byte layout with CRC16 error checking.
- **Half-duplex**: RS485 is a shared wire. Only one device transmits at a time. The DIR pin controls who's talking.
- **Function codes**: `0x03` = Read Holding Registers (most common).

```
Message lifecycle (timing is critical!):

  ESP32                                Sensor
    │                                     │
    ├── Set DIR=HIGH (start transmitting)─┤
    ├── Send request (8 bytes) ──────────▶│
    ├── Wait uS for TX buffer to empty ──▶│
    ├── Set DIR=LOW (start listening) ───▶│
    │                                     │
    │                          3.5 char delay (sensor processing)
    │                                     │
    │◀─────────────────── Send response ──┤  (up to 21 bytes)
    │                                     │
    │  Wait max 100ms for first byte      │
    │  Wait max 2ms between subsequent    │
    │  bytes (if gap > 2ms, frame done)   │
    │                                     │
    ├── Validate CRC                      │
    ├── Extract register values           │
    │                                     │
    │           Total: ~30-50ms           │
```

### Why from scratch?

The project doesn't use a Modbus library because:
1. The protocol is simple enough to implement in ~150 lines
2. Fewer dependencies = easier cross-compilation for ESP32
3. Full control over timing (critical for RS485 direction switching)
4. Educational value

---

## 10. Key Files Cheat Sheet

| File | What It Does | Who Owns It |
|------|-------------|-------------|
| `src/main.cpp` | ESP32 command loop + serial I/O | Firmware dev |
| `include/config.h` | Pin definitions, sensor params, defaults | Firmware dev |
| `include/modbus_npk_sensor.h` | Modbus RTU master driver | Firmware dev |
| `include/soil_recommendation.h` | STCR rice equations + product math | Firmware dev |
| `host/browserServer.js` | Express server + REST endpoints | Full-stack dev |
| `host/esp32SerialTool.js` | Serial port abstraction with promise queue | Full-stack dev |
| `host/realtimeBridge.js` | CLI bridge → OpenAI WebSocket | Backend dev |
| `host/realtimePrompt.js` | System prompt for GPT personality | Backend dev |
| `host/realtimeTools.js` | OpenAI function definitions | Backend dev |
| `host/stcrEngine.js` | Multi-crop ranking engine | Data scientist |
| `host/stcrFormulaRegistry.js` | 52 crop formula coefficient registry | Data scientist |
| `host/serialSmokeTest.js` | Quick integration test script | QA |
| `public/index.html` | Browser UI layout | Frontend dev |
| `public/app.js` | WebRTC + DataChannel + tool bridge | Frontend dev |
| `public/styles.css` | Dark theme styling | Frontend dev |
| `platformio.ini` | ESP32 build configuration | Firmware dev |
| `package.json` | Node.js dependencies and scripts | All |

---

## Architecture Principles

1. **ESP32 is source of truth** for sensor readings and rice STCR. The host enriches but never overrides.

2. **JSON contract** between ESP32 and host — one JSON line per command. Simple enough to parse with a `startsWith("{")` check.

3. **API key stays on server** — browser gets only a short-lived ephemeral token from OpenAI. Never exposes `OPENAI_API_KEY`.

4. **Dual mode operation** — CLI bridge for developers (text only), browser server for users (voice + visuals).

5. **Offline-capable core** — the ESP32 can compute the primary crop recommendation (rice) completely offline. Only multi-crop ranking needs the host.

6. **Deterministic math** — the same NPK values always produce the same STCR results. No randomness in crop recommendations.
