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
];
