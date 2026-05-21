# ESP32 NPK STCR Recommender

PlatformIO firmware for an ESP32-S3 (USB serial) connected to a ZTS-3002-TR-NPK-N01 NPK sensor over RS485/Modbus RTU.

`platformio.ini` targets the `esp32-s3-devkitc-1` board profile, which matches the Espressif USB JTAG/serial device most ESP32-S3 dev kits expose to macOS as `/dev/cu.usbmodem*`.

`ARDUINO_USB_CDC_ON_BOOT` is enabled so Arduino `Serial` uses the native USB port (otherwise you may see a blank serial monitor on USB-only S3 boards).

## Hardware Wiring

Use an RS485 transceiver module, such as MAX485, between the ESP32 and sensor.

```text
ESP32 GPIO16 RX2  <- RS485 RO
ESP32 GPIO17 TX2  -> RS485 DI
ESP32 GPIO4       -> RS485 DE and /RE tied together
ESP32 GND         -> RS485 GND and sensor power GND

RS485 A           -> Sensor A
RS485 B           -> Sensor B
Sensor V+         -> Sensor-rated external supply
Sensor GND        -> Supply GND / ESP32 GND
```

Many ZTS/JXBS-compatible NPK sensors use slave address `1`, baud `4800`, and holding registers starting at `0x001E`. If your datasheet differs, update `include/config.h`.

## Serial Commands

Open the monitor:

```sh
pio device list
pio run -t upload
pio device monitor
```

Commands:

```text
READ_NPK        Read the physical sensor and print summary + JSON
JSON            Read the physical sensor and print JSON only
MOCK N P K      Test maths without sensor, example: MOCK 120 30 200
TARGET 60       Set rice target yield in q/ha
AUTO ON|OFF     Enable or disable automatic 5-second JSON reads
HELP            Show command menu
```

## Deterministic Model

The ESP32 firmware still calculates the first rice demo equation locally:

```text
FN = 3.58T - 0.57SN
FP = 1.71T - 2.46SP
FK = 1.48T - 0.16SK
```

Default target yield is `T = 60 q/ha`.

Confidence is calculated as:

```text
N_score = 1 - FN / FN_max
P_score = 1 - FP / FP_max
K_score = 1 - FK / FK_max

Confidence = 100 * (0.4N_score + 0.3P_score + 0.3K_score)
```

Scores are clamped between `0` and `1`.

The host app then enriches the ESP32 JSON with a multi-crop STCR ranking. It:

1. Classifies sensor NPK using Indian low/medium/high soil fertility classes.
2. Runs every registered crop formula against the same NPK values.
3. Converts N, P2O5 and K2O fertilizer gaps into urea, DAP and MOP estimates.
4. Ranks crops by the weighted nutrient-gap score:

```text
N_gap = fertilizer_N / max_fertilizer_N
P_gap = fertilizer_P2O5 / max_fertilizer_P2O5
K_gap = fertilizer_K2O / max_fertilizer_K2O

Confidence = 100 * (1 - (0.4N_gap + 0.3P_gap + 0.3K_gap))
```

### Soil fertility classes

```text
Available N: Low < 280 kg/ha, Medium 280-560 kg/ha, High > 560 kg/ha
Available P: Low < 10 kg/ha, Medium 10-25 kg/ha, High > 25 kg/ha
Available K: Low < 108 kg/ha, Medium 108-280 kg/ha, High > 280 kg/ha
```

### Formula coverage

The registry in `host/stcrFormulaRegistry.js` includes South India and India STCR equations for rice, wheat, maize, hybrid maize, rainfed maize, sorghum, ragi, pearl millet, little millet, blackgram, greengram, groundnut, sunflower, gingelly, sugarcane, cotton, Bt cotton, onion, big onion, bhendi, cabbage, tomato, brinjal, beetroot, radish, potato, cauliflower, carrot, tapioca, chilli, turmeric, ashwagandha, glory lily, chrysanthemum, and kodo millet.

Key sources added:

- ICAR-AICRP STCR framework, ICAR-IISS Bhopal.
- Telangana rice farmer-field STCR demonstration, 60 q/ha target.
- Rice STCR-IPNS / rice-rice sequence studies for Puducherry and Tamil Nadu.
- ICAR-IARI late-sown wheat STCR equations.
- TNAU STCR-IPNS technology database for broad Tamil Nadu crop coverage.
- Andhra Pradesh Alfisol groundnut STCR-IPNS validation.
- Tamil Nadu rainfed Bt cotton STCR-IPNS validation.
- Karnataka / UAS Bangalore Alfisol long-term Southern India STCR study.
- Scientific Reports kodo millet Alfisol STCR equations.
- Recent South India STCR studies for barnyard millet, coriander, and aerobic rice as supporting coverage.

Some TNAU formulas provide equations but not a single universal target yield in the database page. For those entries, the app uses a clearly marked project demo target so the crop can still be ranked. Override targets for serious field use.

## Browser Voice App

Run the local browser server:

```sh
npm run dev
```

Then open:

```text
http://localhost:3000
```

Click **Start voice session**, allow microphone access, and talk to the assistant. The browser uses a short-lived Realtime client secret from the local server, so your OpenAI API key stays in `.env` and never goes to the page.

The page can:

- Stream microphone audio to `gpt-realtime-1.5`.
- Play the assistant voice response in the browser.
- Let the model call `read_npk_sensor` through the local server.
- Show soil class, ranked crop confidence, fertilizer products, latest JSON, and runtime event log.
- Use a mock NPK reading while the physical RS485 sensor is not wired.

## GPT Realtime CLI Bridge

The host bridge connects `gpt-realtime-1.5` to the ESP32 over USB serial. The model can call `read_npk_sensor`; the ESP32 remains the source of truth for NPK values, STCR maths, confidence, and fertilizer estimates.

Set environment variables:

```sh
cp .env.example .env
```

Then add your `OPENAI_API_KEY` to `.env`.

Install dependencies:

```sh
npm install
```

Run a serial-only smoke test:

```sh
npm run serial:mock
```

Run the Realtime text bridge:

```sh
npm run realtime
```

Example prompts:

```text
Can I grow rice with the current sensor reading?
Use mock N=120 P=30 K=200 and explain the fertilizer advice.
```

The first version is text-first for debugging. The same `read_npk_sensor` tool can be reused when you switch the session to speech input/output.

## Twilio Outbound NPK Call

The host can also place an outbound Twilio Voice call, stream the call audio to the OpenAI Realtime API, capture a live ESP32 NPK reading before dialing, and let the assistant discuss that reading with the recipient.

Use the same Twilio/Realtime environment variable names as the `voice-agent` project:

```sh
OPENAI_API_KEY=sk-your-key-here
REALTIME_MODEL=gpt-realtime-1.5
REALTIME_VOICE=marin
REALTIME_TRANSCRIPTION_MODEL=gpt-4o-transcribe
TRANSCRIPTION_LANGUAGE=en
PUBLIC_BASE_URL=https://your-public-ngrok-url.example
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_FROM_NUMBER=+15551234567
TWILIO_TO_NUMBER=+15557654321
TWILIO_NO_PLACE_CALL=false
TWILIO_MOCK_NPK=
TWILIO_HOST=0.0.0.0
TWILIO_PORT=3000
ESP32_SERIAL_PORT=/dev/cu.usbmodem11101
ESP32_SERIAL_BAUD=115200
PORT=3001
```

Use separate local ports when running the browser app and Twilio bridge together: `PORT=3001` for the browser app, and `TWILIO_PORT=3000` for the Twilio webhook server. Start the public tunnel to the Twilio port, then dial:

```sh
npm run twilio:call
```

For webhook testing without dialing:

```sh
TWILIO_NO_PLACE_CALL=true
```

For a demo without the physical sensor:

```sh
TWILIO_MOCK_NPK=120,30,200
```

CLI flags are still supported as temporary overrides, for example `npm run twilio:call -- --to-number +15551234567`.
