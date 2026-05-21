import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { access } from "node:fs/promises";

const DEFAULT_TIMEOUT_MS = 4_000;
const LOCK_RETRY_DELAYS_MS = [200, 400, 800, 1_200, 1_600];

export class Esp32SerialTool {
  constructor({ portPath, baudRate = 115200, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    this.portPath = portPath;
    this.baudRate = baudRate;
    this.timeoutMs = timeoutMs;
    this.pendingJsonResolvers = [];
    this.commandQueue = Promise.resolve();
  }

  async open() {
    if (this.port?.isOpen) {
      return;
    }

    this.portPath = await resolvePortPath(this.portPath);
    this.port = new SerialPort({
      path: this.portPath,
      baudRate: this.baudRate,
      autoOpen: false,
    });

    this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));
    this.parser.on("data", (line) => this.handleLine(line));

    await this.openWithRetry();

    // Give the ESP32 USB CDC stream a moment to settle after the host opens it.
    await sleep(250);
  }

  async close() {
    if (!this.port?.isOpen) {
      return;
    }

    await new Promise((resolve, reject) => {
      this.port.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async openWithRetry() {
    for (let attempt = 0; attempt <= LOCK_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await new Promise((resolve, reject) => {
          this.port.open((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
        return;
      } catch (error) {
        if (!isTemporaryPortLock(error) || attempt === LOCK_RETRY_DELAYS_MS.length) {
          throw error;
        }
        await sleep(LOCK_RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  async readNpkSensor() {
    return this.enqueueCommand("JSON");
  }

  async mockNpk({ nitrogenKgHa, phosphorusKgHa, potassiumKgHa }) {
    return this.enqueueCommand(
      `MOCK ${toNonNegativeInt(nitrogenKgHa)} ${toNonNegativeInt(phosphorusKgHa)} ${toNonNegativeInt(potassiumKgHa)}`,
    );
  }

  async setTargetYield({ targetYieldQHa }) {
    return this.enqueueCommand(`TARGET ${Number(targetYieldQHa)}`);
  }

  async getCalibration() {
    return this.enqueueCommand("CAL SHOW");
  }

  async resetCalibration() {
    return this.enqueueCommand("CAL RESET");
  }

  async setCalibration({ nutrient, slope, offset }) {
    return this.enqueueCommand(
      `CAL SET ${toNutrient(nutrient)} ${toFiniteNumber(slope, "slope")} ${toFiniteNumber(offset, "offset")}`,
    );
  }

  async setOffsetCalibration({ nutrient, rawValue, referenceValue }) {
    return this.enqueueCommand(
      `CAL OFFSET ${toNutrient(nutrient)} ${toNonNegativeNumber(rawValue, "rawValue")} ${toNonNegativeNumber(referenceValue, "referenceValue")}`,
    );
  }

  async setTwoPointCalibration({ nutrient, rawValue1, referenceValue1, rawValue2, referenceValue2 }) {
    return this.enqueueCommand(
      `CAL TWO ${toNutrient(nutrient)} ${toNonNegativeNumber(rawValue1, "rawValue1")} ${toNonNegativeNumber(referenceValue1, "referenceValue1")} ${toNonNegativeNumber(rawValue2, "rawValue2")} ${toNonNegativeNumber(referenceValue2, "referenceValue2")}`,
    );
  }

  async enqueueCommand(command) {
    const run = this.commandQueue.then(() => this.writeCommand(command));

    // Keep later commands usable even if one sensor read times out or fails.
    this.commandQueue = run.catch(() => {});
    return run;
  }

  async writeCommand(command) {
    await this.open();

    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (payload) => {
          cleanup();
          resolve(payload);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for ESP32 JSON response to ${command}`));
      }, this.timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        this.pendingJsonResolvers = this.pendingJsonResolvers.filter((entry) => entry !== waiter);
      };

      this.pendingJsonResolvers.push(waiter);

      // ESP32 command parsing accepts either CR or LF; send both for terminal parity.
      this.port.write(`${command}\r\n`, (error) => {
        if (error) {
          cleanup();
          reject(error);
          return;
        }
        this.port.drain();
      });
    });
  }

  handleLine(rawLine) {
    const line = rawLine.trim();
    if (!line.startsWith("{")) {
      return;
    }

    let payload;
    try {
      payload = JSON.parse(line);
    } catch {
      return;
    }

    const waiter = this.pendingJsonResolvers.shift();
    if (waiter) {
      waiter.resolve(payload);
    }
  }
}

function toNonNegativeInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("NPK values must be non-negative numbers");
  }
  return Math.round(number);
}

function toNutrient(value) {
  const nutrient = String(value || "").trim().toUpperCase();
  if (!["N", "P", "K"].includes(nutrient)) {
    throw new Error("nutrient must be N, P, or K");
  }
  return nutrient;
}

function toFiniteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a finite number`);
  }
  return number;
}

function toNonNegativeNumber(value, name) {
  const number = toFiniteNumber(value, name);
  if (number < 0) {
    throw new Error(`${name} must be non-negative`);
  }
  return number;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolvePortPath(configuredPath) {
  if (configuredPath && (await pathExists(configuredPath))) {
    return configuredPath;
  }

  const ports = await SerialPort.list();
  const detected = ports
    .map((port) => port.path)
    .find((path) => /\/dev\/cu\.(usbmodem|usbserial)/.test(path));

  if (detected) {
    return detected;
  }

  const configuredMessage = configuredPath ? ` Configured path was ${configuredPath}.` : "";
  throw new Error(`ESP32 serial port not found.${configuredMessage} Replug the ESP32 and check pio device list.`);
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isTemporaryPortLock(error) {
  const message = String(error?.message || "");
  return /Resource temporarily unavailable|Cannot lock port|busy|EBUSY/i.test(message);
}
