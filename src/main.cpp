#include <Arduino.h>

#include "config.h"
#include "modbus_npk_sensor.h"
#include "soil_recommendation.h"

HardwareSerial SensorSerial(2);
ModbusNpkSensor npkSensor(
    SensorSerial,
    Config::SensorSlaveAddress,
    Config::Rs485DirectionPin,
    Config::SensorReadTimeoutMs);
SoilRecommendationEngine recommendationEngine(Config::DefaultRiceTargetYieldQHa);

String serialCommand;
bool automaticReadsEnabled = false;
uint32_t lastAutomaticReadAt = 0;

/**
 * Prints a fixed precision number for compact serial JSON output.
 */
void printNumber(float value) {
  Serial.print(value, 2);
}

/**
 * Classifies a nutrient score in farmer-friendly terms.
 */
const char* nutrientStatus(float score) {
  if (score < 0.35F) {
    return "low";
  }
  if (score < 0.70F) {
    return "moderate";
  }
  return "good";
}

/**
 * Emits one machine-readable JSON line for GPT Realtime tool-calling later.
 */
void printJsonResult(const NpkReading& reading, const RiceSuitability& rice) {
  Serial.print(F("{\"ok\":true,\"sensor\":{\"n_kg_ha\":"));
  Serial.print(reading.nitrogenKgHa);
  Serial.print(F(",\"p_kg_ha\":"));
  Serial.print(reading.phosphorusKgHa);
  Serial.print(F(",\"k_kg_ha\":"));
  Serial.print(reading.potassiumKgHa);
  Serial.print(F(",\"source\":\"zts_3002_tr_npk_n01\"},\"rice\":{\"target_yield_q_ha\":"));
  printNumber(rice.targetYieldQHa);
  Serial.print(F(",\"fertilizer_requirement_kg_ha\":{\"n\":"));
  printNumber(rice.requirement.nitrogenKgHa);
  Serial.print(F(",\"p\":"));
  printNumber(rice.requirement.phosphorusKgHa);
  Serial.print(F(",\"k\":"));
  printNumber(rice.requirement.potassiumKgHa);
  Serial.print(F("},\"scores\":{\"n\":"));
  printNumber(rice.nitrogenScore);
  Serial.print(F(",\"p\":"));
  printNumber(rice.phosphorusScore);
  Serial.print(F(",\"k\":"));
  printNumber(rice.potassiumScore);
  Serial.print(F("},\"confidence_percent\":"));
  printNumber(rice.confidencePercent);
  Serial.print(F(",\"nutrient_status\":{\"n\":\""));
  Serial.print(nutrientStatus(rice.nitrogenScore));
  Serial.print(F("\",\"p\":\""));
  Serial.print(nutrientStatus(rice.phosphorusScore));
  Serial.print(F("\",\"k\":\""));
  Serial.print(nutrientStatus(rice.potassiumScore));
  Serial.print(F("\"},\"fertilizer_products_kg_acre\":{\"urea\":"));
  printNumber(rice.products.ureaKgAcre);
  Serial.print(F(",\"dap\":"));
  printNumber(rice.products.dapKgAcre);
  Serial.print(F(",\"mop\":"));
  printNumber(rice.products.mopKgAcre);
  Serial.println(F("}}}"));
}

/**
 * Emits deterministic failure JSON so a caller can handle hardware errors cleanly.
 */
void printJsonError(const String& error) {
  Serial.print(F("{\"ok\":false,\"error\":\""));
  Serial.print(error);
  Serial.println(F("\"}"));
}

/**
 * Prints a short human-readable summary beside the JSON contract.
 */
void printHumanSummary(const NpkReading& reading, const RiceSuitability& rice) {
  Serial.println(F("\n--- Soil Recommendation ---"));
  Serial.print(F("NPK sensor values (kg/ha): N="));
  Serial.print(reading.nitrogenKgHa);
  Serial.print(F(", P="));
  Serial.print(reading.phosphorusKgHa);
  Serial.print(F(", K="));
  Serial.println(reading.potassiumKgHa);

  Serial.print(F("Rice target yield: "));
  printNumber(rice.targetYieldQHa);
  Serial.println(F(" q/ha"));

  Serial.print(F("STCR fertilizer requirement (kg/ha): N="));
  printNumber(rice.requirement.nitrogenKgHa);
  Serial.print(F(", P="));
  printNumber(rice.requirement.phosphorusKgHa);
  Serial.print(F(", K="));
  printNumber(rice.requirement.potassiumKgHa);
  Serial.println();

  Serial.print(F("Rice confidence: "));
  printNumber(rice.confidencePercent);
  Serial.println(F("%"));

  Serial.print(F("Approx fertilizer products (kg/acre): Urea="));
  printNumber(rice.products.ureaKgAcre);
  Serial.print(F(", DAP="));
  printNumber(rice.products.dapKgAcre);
  Serial.print(F(", MOP="));
  printNumber(rice.products.mopKgAcre);
  Serial.println();
  Serial.println(F("---------------------------\n"));
}

/**
 * Reads the physical NPK sensor and prints both farmer-facing and tool-facing output.
 */
void readSensorAndReport(bool humanOutput) {
  NpkReading reading;
  String error;
  if (!npkSensor.readNpk(Config::NpkRegisterStart, reading, error)) {
    printJsonError(error);
    return;
  }

  const RiceSuitability rice = recommendationEngine.evaluateRice(reading);
  if (humanOutput) {
    printHumanSummary(reading, rice);
  }
  printJsonResult(reading, rice);
}

/**
 * Runs the deterministic maths against typed values while the sensor wiring is pending.
 */
void reportMockReading(uint16_t nitrogen, uint16_t phosphorus, uint16_t potassium) {
  NpkReading reading;
  reading.nitrogenKgHa = nitrogen;
  reading.phosphorusKgHa = phosphorus;
  reading.potassiumKgHa = potassium;

  const RiceSuitability rice = recommendationEngine.evaluateRice(reading);
  printHumanSummary(reading, rice);
  printJsonResult(reading, rice);
}

/**
 * Tries common Modbus NPK settings on the configured RS485 pins.
 */
void scanNpkSensor() {
  const uint32_t bauds[] = {4800, 9600};
  const uint8_t slaveAddresses[] = {1, 2, 3, 4, 5};
  const uint16_t registerStarts[] = {0x001E, 0x0000};

  Serial.println(F("{\"ok\":true,\"scan\":\"started\"}"));
  for (const uint32_t baud : bauds) {
    npkSensor.begin(
        baud,
        SERIAL_8N1,
        Config::SensorRxPin,
        Config::SensorTxPin);
    delay(100);

    for (const uint8_t slaveAddress : slaveAddresses) {
      for (const uint16_t registerStart : registerStarts) {
        NpkReading reading;
        String error;
        if (!npkSensor.readNpkFrom(slaveAddress, registerStart, reading, error)) {
          Serial.print(F("{\"ok\":false,\"scan_attempt\":{\"baud\":"));
          Serial.print(baud);
          Serial.print(F(",\"slave\":"));
          Serial.print(slaveAddress);
          Serial.print(F(",\"register_start\":\"0x"));
          if (registerStart < 0x1000) {
            Serial.print(F("0"));
          }
          if (registerStart < 0x0100) {
            Serial.print(F("0"));
          }
          if (registerStart < 0x0010) {
            Serial.print(F("0"));
          }
          Serial.print(registerStart, HEX);
          Serial.print(F("\",\"error\":\""));
          Serial.print(error);
          Serial.println(F("\"}}"));
          continue;
        }

        Serial.print(F("{\"ok\":true,\"scan_match\":{\"baud\":"));
        Serial.print(baud);
        Serial.print(F(",\"slave\":"));
        Serial.print(slaveAddress);
        Serial.print(F(",\"register_start\":\"0x"));
        if (registerStart < 0x1000) {
          Serial.print(F("0"));
        }
        if (registerStart < 0x0100) {
          Serial.print(F("0"));
        }
        if (registerStart < 0x0010) {
          Serial.print(F("0"));
        }
        Serial.print(registerStart, HEX);
        Serial.print(F("\",\"n_kg_ha\":"));
        Serial.print(reading.nitrogenKgHa);
        Serial.print(F(",\"p_kg_ha\":"));
        Serial.print(reading.phosphorusKgHa);
        Serial.print(F(",\"k_kg_ha\":"));
        Serial.print(reading.potassiumKgHa);
        Serial.println(F("}}"));
      }
    }
  }

  npkSensor.begin(
      Config::SensorBaud,
      SERIAL_8N1,
      Config::SensorRxPin,
      Config::SensorTxPin);
  Serial.println(F("{\"ok\":true,\"scan\":\"finished\"}"));
}

void printHelp() {
  Serial.println(F("\nCommands:"));
  Serial.println(F("  READ_NPK        Read sensor and print summary + JSON"));
  Serial.println(F("  JSON            Read sensor and print JSON only"));
  Serial.println(F("  MOCK N P K      Test maths without sensor, example: MOCK 120 30 200"));
  Serial.println(F("  SCAN            Try common Modbus NPK baud/slave/register settings"));
  Serial.println(F("  TARGET 60       Set rice target yield in q/ha"));
  Serial.println(F("  AUTO ON|OFF     Enable/disable 5-second automatic reads"));
  Serial.println(F("  HELP            Show this menu\n"));
}

/**
 * Handles serial commands from PlatformIO monitor or a future GPT tool bridge.
 */
void handleCommand(String command) {
  command.trim();
  if (command.length() == 0) {
    return;
  }

  String upperCommand = command;
  upperCommand.toUpperCase();

  if (upperCommand == F("HELP")) {
    printHelp();
    return;
  }

  if (upperCommand == F("READ_NPK") || upperCommand == F("READ")) {
    readSensorAndReport(true);
    return;
  }

  if (upperCommand == F("JSON")) {
    readSensorAndReport(false);
    return;
  }

  if (upperCommand == F("SCAN")) {
    scanNpkSensor();
    return;
  }

  if (upperCommand.startsWith(F("TARGET "))) {
    const float targetYield = command.substring(7).toFloat();
    if (targetYield <= 0.0F) {
      printJsonError(F("Target yield must be greater than zero"));
      return;
    }
    recommendationEngine.setTargetYield(targetYield);
    Serial.print(F("{\"ok\":true,\"target_yield_q_ha\":"));
    printNumber(recommendationEngine.targetYieldQHa());
    Serial.println(F("}"));
    return;
  }

  if (upperCommand == F("AUTO ON")) {
    automaticReadsEnabled = true;
    Serial.println(F("{\"ok\":true,\"auto_reads\":true}"));
    return;
  }

  if (upperCommand == F("AUTO OFF")) {
    automaticReadsEnabled = false;
    Serial.println(F("{\"ok\":true,\"auto_reads\":false}"));
    return;
  }

  if (upperCommand.startsWith(F("MOCK "))) {
    int nitrogen = 0;
    int phosphorus = 0;
    int potassium = 0;
    if (sscanf(command.c_str(), "%*s %d %d %d", &nitrogen, &phosphorus, &potassium) != 3 ||
        nitrogen < 0 || phosphorus < 0 || potassium < 0) {
      printJsonError(F("Use MOCK N P K with non-negative integer kg/ha values"));
      return;
    }
    reportMockReading(
        static_cast<uint16_t>(nitrogen),
        static_cast<uint16_t>(phosphorus),
        static_cast<uint16_t>(potassium));
    return;
  }

  printJsonError(F("Unknown command. Type HELP"));
}

void setup() {
  Serial.begin(115200);
  delay(500);

  npkSensor.begin(
      Config::SensorBaud,
      SERIAL_8N1,
      Config::SensorRxPin,
      Config::SensorTxPin);

  Serial.println(F("\nESP32 NPK STCR recommender ready."));
  Serial.println(F("Wire sensor through RS485, then type READ_NPK."));
  printHelp();
}

void loop() {
  while (Serial.available() > 0) {
    const char c = static_cast<char>(Serial.read());
    if (c == '\n' || c == '\r') {
      handleCommand(serialCommand);
      serialCommand = "";
    } else {
      serialCommand += c;
    }
  }

  if (automaticReadsEnabled &&
      millis() - lastAutomaticReadAt >= Config::AutomaticReadIntervalMs) {
    lastAutomaticReadAt = millis();
    readSensorAndReport(false);
  }
}
