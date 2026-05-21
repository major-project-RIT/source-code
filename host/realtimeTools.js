export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "read_npk_sensor",
    description:
      "Read the current NPK sensor result from the ESP32 and return deterministic soil classification, STCR multi-crop ranking, confidence, and fertilizer product estimates.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "mock_npk_sensor",
    description:
      "Demo-only fallback. Run the same deterministic STCR multi-crop ranking with supplied NPK kg/ha values when the physical RS485 sensor is not wired yet.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        nitrogenKgHa: {
          type: "number",
          description: "Soil available nitrogen in kg/ha.",
        },
        phosphorusKgHa: {
          type: "number",
          description: "Soil available phosphorus in kg/ha.",
        },
        potassiumKgHa: {
          type: "number",
          description: "Soil available potassium in kg/ha.",
        },
      },
      required: ["nitrogenKgHa", "phosphorusKgHa", "potassiumKgHa"],
    },
  },
  {
    type: "function",
    name: "rank_crops_from_npk",
    description:
      "Rank all registered South India STCR crop formulas from supplied NPK kg/ha values without contacting the ESP32.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        nitrogenKgHa: {
          type: "number",
          description: "Soil available nitrogen in kg/ha.",
        },
        phosphorusKgHa: {
          type: "number",
          description: "Soil available phosphorus in kg/ha.",
        },
        potassiumKgHa: {
          type: "number",
          description: "Soil available potassium in kg/ha.",
        },
      },
      required: ["nitrogenKgHa", "phosphorusKgHa", "potassiumKgHa"],
    },
  },
  {
    type: "function",
    name: "fetch_realtime_weather",
    description:
      "Fetch current weather for a user-provided city using OpenAI native web search. Use this when weather can affect soil sampling, irrigation, fertilizer timing, or field work.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        city: {
          type: "string",
          description:
            "The current city or nearest city to search weather for. Ask the user for this before calling the tool if it is unknown.",
        },
      },
      required: ["city"],
    },
  },
  {
    type: "function",
    name: "get_npk_calibration",
    description: "Read the active N/P/K slope and offset calibration values stored on the ESP32.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "reset_npk_calibration",
    description: "Reset ESP32 N/P/K calibration to slope 1 and offset 0.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "set_npk_calibration",
    description:
      "Set one ESP32 nutrient calibration coefficient directly as calibrated = slope * raw + offset.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        nutrient: {
          type: "string",
          enum: ["N", "P", "K"],
          description: "N, P, or K.",
        },
        slope: {
          type: "number",
          description: "Positive calibration slope.",
        },
        offset: {
          type: "number",
          description: "Calibration offset in kg/ha.",
        },
      },
      required: ["nutrient", "slope", "offset"],
    },
  },
  {
    type: "function",
    name: "set_npk_offset_calibration",
    description:
      "Set one-point ESP32 calibration for one nutrient from averaged raw and lab/reference values.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        nutrient: {
          type: "string",
          enum: ["N", "P", "K"],
          description: "N, P, or K.",
        },
        rawValue: {
          type: "number",
          description: "Averaged raw sensor value in kg/ha.",
        },
        referenceValue: {
          type: "number",
          description: "Lab/reference value for the same soil in kg/ha.",
        },
      },
      required: ["nutrient", "rawValue", "referenceValue"],
    },
  },
  {
    type: "function",
    name: "set_npk_two_point_calibration",
    description:
      "Set two-point ESP32 calibration for one nutrient from two raw/reference soil sample pairs.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        nutrient: {
          type: "string",
          enum: ["N", "P", "K"],
          description: "N, P, or K.",
        },
        rawValue1: {
          type: "number",
          description: "Averaged raw value for sample 1 in kg/ha.",
        },
        referenceValue1: {
          type: "number",
          description: "Lab/reference value for sample 1 in kg/ha.",
        },
        rawValue2: {
          type: "number",
          description: "Averaged raw value for sample 2 in kg/ha.",
        },
        referenceValue2: {
          type: "number",
          description: "Lab/reference value for sample 2 in kg/ha.",
        },
      },
      required: ["nutrient", "rawValue1", "referenceValue1", "rawValue2", "referenceValue2"],
    },
  },
];
