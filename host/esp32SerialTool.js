import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";

const DEFAULT_TIMEOUT_MS = 4_000;

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

    this.port = new SerialPort({
      path: this.portPath,
      baudRate: this.baudRate,
      autoOpen: false,
    });

    this.parser = this.port.pipe(new ReadlineParser({ delimiter: "\n" }));
    this.parser.on("data", (line) => this.handleLine(line));

    await new Promise((resolve, reject) => {
      this.port.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
