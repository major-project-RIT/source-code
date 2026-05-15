#pragma once

#include <Arduino.h>

struct NpkReading {
  uint16_t nitrogenKgHa = 0;
  uint16_t phosphorusKgHa = 0;
  uint16_t potassiumKgHa = 0;
};

class ModbusNpkSensor {
 public:
  ModbusNpkSensor(
      HardwareSerial& serial,
      uint8_t slaveAddress,
      int directionPin,
      uint32_t timeoutMs)
      : serial_(serial),
        slaveAddress_(slaveAddress),
        directionPin_(directionPin),
        timeoutMs_(timeoutMs) {}

  void begin(uint32_t baud, uint32_t config, int rxPin, int txPin) {
    pinMode(directionPin_, OUTPUT);
    setReceiveMode();
    serial_.begin(baud, config, rxPin, txPin);
  }

  bool readNpk(uint16_t registerStart, NpkReading& reading, String& error) {
    return readNpkFrom(slaveAddress_, registerStart, reading, error);
  }

  bool readNpkFrom(
      uint8_t slaveAddress,
      uint16_t registerStart,
      NpkReading& reading,
      String& error) {
    uint16_t registers[3] = {0, 0, 0};
    if (!readHoldingRegisters(slaveAddress, registerStart, 3, registers, error)) {
      return false;
    }

    reading.nitrogenKgHa = registers[0];
    reading.phosphorusKgHa = registers[1];
    reading.potassiumKgHa = registers[2];
    return true;
  }

 private:
  HardwareSerial& serial_;
  const uint8_t slaveAddress_;
  const int directionPin_;
  const uint32_t timeoutMs_;

  void setTransmitMode() const {
    digitalWrite(directionPin_, HIGH);
    delayMicroseconds(120);
  }

  void setReceiveMode() const {
    delayMicroseconds(120);
    digitalWrite(directionPin_, LOW);
  }

  static uint16_t crc16Modbus(const uint8_t* data, size_t length) {
    uint16_t crc = 0xFFFF;

    for (size_t i = 0; i < length; ++i) {
      crc ^= data[i];
      for (uint8_t bit = 0; bit < 8; ++bit) {
        const bool lsbSet = (crc & 0x0001) != 0;
        crc >>= 1;
        if (lsbSet) {
          crc ^= 0xA001;
        }
      }
    }

    return crc;
  }

  void clearInputBuffer() {
    while (serial_.available() > 0) {
      serial_.read();
    }
  }

  bool readExact(uint8_t* buffer, size_t length) {
    const uint32_t startedAt = millis();
    size_t offset = 0;

    while (offset < length && millis() - startedAt < timeoutMs_) {
      if (serial_.available() > 0) {
        buffer[offset++] = static_cast<uint8_t>(serial_.read());
      } else {
        delay(2);
      }
    }

    return offset == length;
  }

  bool readHoldingRegisters(
      uint8_t slaveAddress,
      uint16_t registerStart,
      uint8_t registerCount,
      uint16_t* registers,
      String& error) {
    if (registerCount == 0 || registerCount > 16) {
      error = F("Invalid Modbus register count");
      return false;
    }

    uint8_t request[8] = {
        slaveAddress,
        0x03,
        static_cast<uint8_t>(registerStart >> 8),
        static_cast<uint8_t>(registerStart & 0xFF),
        0x00,
        registerCount,
        0x00,
        0x00,
    };
    const uint16_t requestCrc = crc16Modbus(request, 6);
    request[6] = static_cast<uint8_t>(requestCrc & 0xFF);
    request[7] = static_cast<uint8_t>(requestCrc >> 8);

    clearInputBuffer();
    setTransmitMode();
    serial_.write(request, sizeof(request));
    serial_.flush();
    setReceiveMode();

    const size_t expectedLength = 5 + (2 * registerCount);
    uint8_t response[37] = {0};
    if (!readExact(response, expectedLength)) {
      error = F("Sensor timeout: no complete Modbus response");
      return false;
    }

    const uint16_t expectedCrc = crc16Modbus(response, expectedLength - 2);
    const uint16_t actualCrc =
        static_cast<uint16_t>(response[expectedLength - 2]) |
        (static_cast<uint16_t>(response[expectedLength - 1]) << 8);
    if (expectedCrc != actualCrc) {
      error = F("Sensor response CRC mismatch");
      return false;
    }

    if (response[0] != slaveAddress || response[1] != 0x03) {
      error = F("Unexpected Modbus slave/function response");
      return false;
    }

    if (response[2] != registerCount * 2) {
      error = F("Unexpected Modbus byte count");
      return false;
    }

    for (uint8_t i = 0; i < registerCount; ++i) {
      const size_t byteIndex = 3 + (2 * i);
      registers[i] = (static_cast<uint16_t>(response[byteIndex]) << 8) |
                     static_cast<uint16_t>(response[byteIndex + 1]);
    }

    return true;
  }
};
