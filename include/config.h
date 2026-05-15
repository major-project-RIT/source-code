#pragma once

#include <Arduino.h>

namespace Config {

// ESP32 UART2 pins wired to the RS485 module.
constexpr int SensorRxPin = 16;  // RS485 RO -> ESP32 RX2
constexpr int SensorTxPin = 17;  // RS485 DI -> ESP32 TX2
constexpr int Rs485DirectionPin = 4;  // Tie MAX485 DE and /RE together here.

// ZTS-3002-TR-NPK-N01 sensors are commonly shipped as Modbus RTU, slave 1, 4800 8N1.
constexpr uint8_t SensorSlaveAddress = 0x01;
constexpr uint32_t SensorBaud = 4800;
constexpr uint32_t SensorReadTimeoutMs = 1000;

// Many ZTS/JXBS-compatible NPK sensors expose N/P/K as 3 holding registers.
// If your supplier sheet lists a different register map, change only these values.
constexpr uint16_t NpkRegisterStart = 0x001E;
constexpr uint8_t NpkRegisterCount = 3;

constexpr float DefaultRiceTargetYieldQHa = 60.0F;
constexpr uint32_t AutomaticReadIntervalMs = 5000;

}  // namespace Config
