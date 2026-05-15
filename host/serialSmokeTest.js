import { Esp32SerialTool } from "./esp32SerialTool.js";

const portPath = process.env.ESP32_SERIAL_PORT || "/dev/cu.usbmodem1101";
const baudRate = Number(process.env.ESP32_SERIAL_BAUD || 115200);

const esp32 = new Esp32SerialTool({ portPath, baudRate });

try {
  const result = await esp32.mockNpk({
    nitrogenKgHa: 120,
    phosphorusKgHa: 30,
    potassiumKgHa: 200,
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await esp32.close();
}
