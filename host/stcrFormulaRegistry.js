const TNAU_SOURCE = {
  id: "tnau-stcr-ipns",
  title: "TNAU STCR-IPNS technologies developed",
  url: "https://tnau.ac.in/site/nrm/soil-science-agricultural-chemistry-technologies-developed/",
  region: "Tamil Nadu, South India",
};

const SOURCES = {
  telanganaRice: {
    id: "telangana-rice-stcr",
    title: "Fertilizer Prescription Equation Demonstration for Targeted Yield of Rice in Telangana farmer fields",
    region: "Telangana, South India",
  },
  puducherryRice: {
    id: "puducherry-rice-stcr-ipns",
    title: "Fertilizer Prescriptions for Rice Based on STCR-IPNS",
    url: "https://ijcmas.com/9-10-2020/U.%20Bagavathi%20Ammal%2C%20et%20al.pdf",
    region: "Puducherry, South India",
  },
  iariWheat: {
    id: "icar-iari-late-sown-wheat",
    title: "Integrated nutrient management prescription for late-sown wheat",
    url: "https://epubs.icar.org.in/index.php/IJAgS/article/download/132398/50269/363552",
    region: "NCR Delhi / alluvial Inceptisol",
  },
  andhraGroundnut: {
    id: "andhra-groundnut-alfisols",
    title: "Validation of soil test and yield target based fertilizer prescription equations for groundnut in Alfisols",
    url: "https://www.chemijournal.com/archives/2020/vol8issue6/PartR/8-6-115-882.pdf",
    region: "YSR district, Andhra Pradesh, South India",
  },
  tamilNaduBtCotton: {
    id: "tamil-nadu-bt-cotton-rainfed",
    title: "Bt cotton STCR-IPNS fertilizer prescription equations under rainfed Tamil Nadu conditions",
    url: "https://ijcmas.com/8-5-2019/T.%20Sherene,%20et%20al.pdf",
    region: "Perambalur district, Tamil Nadu, South India",
  },
  kodoMilletKarnataka: {
    id: "karnataka-kodo-millet-alfisols",
    title: "Optimizing nutrient management for Kodo millet in Alfisols of Southern India",
    url: "https://www.nature.com/articles/s41598-024-83265-y",
    region: "Karnataka Alfisols, South India",
  },
  frontiersSouthIndia: {
    id: "frontiers-south-india-alfisols",
    title: "Soil test crop response nutrient prescription equations for improving soil health and yield sustainability",
    url: "https://www.frontiersin.org/journals/plant-science/articles/10.3389/fpls.2024.1439523/full",
    region: "UAS Bangalore Alfisols, South India",
  },
  tnau: TNAU_SOURCE,
};

const DEFAULT_TARGETS = {
  rice: 60,
  wheat: 55,
  maize: 60,
  "hybrid maize": 60,
  "rainfed maize": 45,
  sorghum: 30,
  ragi: 30,
  "pearl millet": 25,
  "little millet": 20,
  blackgram: 8,
  greengram: 8,
  groundnut: 30,
  sunflower: 20,
  gingelly: 8,
  sugarcane: 100,
  cotton: 32,
  "bt cotton": 32,
  onion: 120,
  "big onion": 180,
  bhendi: 120,
  cabbage: 300,
  tomato: 300,
  brinjal: 250,
  beetroot: 250,
  radish: 250,
  potato: 250,
  cauliflower: 250,
  carrot: 250,
  tapioca: 300,
  chilli: 20,
  turmeric: 300,
  ashwagandha: 15,
  "glory lily": 15,
  chrysanthemum: 120,
  "kodo millet": 17,
  "barnyard millet": 28,
};

const CORE_FORMULAS = [
  formula("rice-telangana-60q", "Rice", "Telangana farmer fields", "rice", SOURCES.telanganaRice, 60, "q/ha", [3.58, 0.57, 0], [1.71, 2.46, 0], [1.48, 0.16, 0], {
    validationStatus: "verified",
    targetSource: "paper_target",
  }),
  formula("rice-puducherry-white-ponni", "Rice", "White Ponni, NPK alone", "rice", SOURCES.puducherryRice, 70, "q/ha", [3.75, 0.52, 0], [1.53, 1.24, 0], [1.58, 0.33, 0], {
    validationStatus: "verified",
    targetSource: "paper_ready_reckoner",
  }),
  formula("rice-puducherry-white-ponni-ipns", "Rice", "White Ponni, NPK + FYM", "rice", SOURCES.puducherryRice, 70, "q/ha", [3.75, 0.52, 0.59], [1.53, 1.24, 1.77], [1.58, 0.33, 0.93], {
    validationStatus: "verified",
    targetSource: "paper_ready_reckoner",
  }),
  formula("wheat-iari-2020", "Wheat", "Late-sown HD-3059, 2020-21", "wheat", SOURCES.iariWheat, 55, "q/ha", [4.48, 0.68, 0], [1.55, 2.10, 0], [1.60, 0.30, 0], {
    validationStatus: "verified",
    targetSource: "paper_ready_reckoner",
  }),
  formula("wheat-iari-2021", "Wheat", "Late-sown HD-3059, 2021-22", "wheat", SOURCES.iariWheat, 55, "q/ha", [4.43, 0.65, 0], [1.52, 2.06, 0], [1.54, 0.28, 0], {
    validationStatus: "verified",
    targetSource: "paper_ready_reckoner",
  }),
  formula("groundnut-andhra-alfisol", "Groundnut", "YSR Alfisols, STCR-IPNS", "groundnut", SOURCES.andhraGroundnut, 30, "q/ha", [3.69, 0.36, 0.60], [1.32, 0.71, 0.68], [2.54, 0.12, 0.24], {
    validationStatus: "verified",
    targetSource: "paper_target",
  }),
  formula("bt-cotton-tamil-nadu-rainfed", "Bt cotton", "Rainfed Pilamedu series", "cotton", SOURCES.tamilNaduBtCotton, 32, "q/ha", [5.35, 0.24, 0.53], [3.67, 1.99, 0.84], [3.83, 0.13, 0.55], {
    validationStatus: "verified",
    targetSource: "paper_target",
  }),
  formula("kodo-millet-karnataka-npk", "Kodo millet", "Southern India Alfisols, NPK alone", "kodo millet", SOURCES.kodoMilletKarnataka, 17, "q/ha", [1.37, 0.38, 0], [0.57, 0.15, 0], [0.60, 0.24, 0], {
    validationStatus: "verified",
    targetSource: "paper_observed_yield_level",
  }),
  formula("kodo-millet-karnataka-fym", "Kodo millet", "Southern India Alfisols, NPK + FYM", "kodo millet", SOURCES.kodoMilletKarnataka, 17, "q/ha", [1.14, 0.33, 0.67], [0.52, 0.19, 0.62], [0.56, 0.23, 0.86], {
    validationStatus: "verified",
    targetSource: "paper_observed_yield_level",
    organicTermMode: "om_t_ha",
  }),
];

const TNAU_FORMULAS = [
  tnau("tnau-rice-kharif-sandy-loam", "Rice", "Kharif, sandy loam to clay loam", "rice", [4.39, 0.52, 0.80], [2.22, 3.63, 0.98], [2.44, 0.39, 0.72]),
  tnau("tnau-rice-rabi-sandy-loam", "Rice", "Rabi, sandy loam to clay loam", "rice", [4.63, 0.56, 0.90], [1.98, 3.18, 0.99], [2.57, 0.42, 0.67]),
  tnau("tnau-rice-sri-rabi", "Rice", "SRI Rabi", "rice", [3.43, 0.34, 0.64], [1.83, 3.24, 0.61], [1.98, 0.18, 0.37]),
  tnau("tnau-rice-kharif-clay", "Rice", "Kharif, clay loam", "rice", [5.29, 0.75, 0.89], [1.65, 1.76, 0.78], [2.73, 0.37, 0.82]),
  tnau("tnau-rice-rabi-clay", "Rice", "Rabi, clay loam", "rice", [5.34, 0.67, 0.73], [1.90, 1.86, 0.70], [2.81, 0.33, 0.80]),
  tnau("tnau-wheat-hills", "Wheat", "Hills, Ooty series", "wheat", [7.60, 0.55, 0.92], [3.59, 0.26, 0.54], [3.88, 0.45, 0.51]),
  tnau("tnau-wheat-plains", "Wheat", "Plains, clay loam", "wheat", [8.83, 0.71, 0.88], [4.52, 1.75, 0.95], [6.05, 0.20, 0.83]),
  tnau("tnau-maize-kharif", "Maize", "Kharif, mixed black calcareous", "maize", [4.60, 0.55, 0], [2.25, 1.80, 0], [5.16, 0.49, 0], {
    validationStatus: "verified",
  }),
  tnau("tnau-maize-rabi", "Maize", "Rabi, clay loam", "maize", [5.29, 0.38, 0.78], [2.08, 1.29, 0.89], [5.20, 0.45, 0.78]),
  tnau("tnau-hybrid-maize-red-sandy", "Hybrid maize", "Red sandy loam", "hybrid maize", [3.96, 0.62, 0.69], [1.56, 1.93, 0.60], [1.66, 0.27, 0.49]),
  tnau("tnau-rainfed-maize-irugur", "Rainfed maize", "Irugur red sandy loam", "rainfed maize", [3.23, 0.42, 0.52], [1.51, 1.98, 0.94], [1.73, 0.21, 0.48]),
  tnau("tnau-sorghum-hybrid", "Sorghum", "Hybrid, clay loam", "sorghum", [6.06, 0.81, 0.53], [2.06, 3.14, 0.72], [5.03, 0.47, 0.66]),
  tnau("tnau-sorghum-variety", "Sorghum", "Varieties, clay loam", "sorghum", [4.35, 0.37, 0.98], [1.18, 1.03, 0.80], [2.68, 0.14, 0.40]),
  tnau("tnau-ragi-black-calcareous", "Ragi", "Mixed black calcareous", "ragi", [10.84, 0.39, 0], [7.23, 1.00, 0], [5.20, 0.04, 0]),
  tnau("tnau-ragi-somayanur", "Ragi", "Somayanur clay loam", "ragi", [6.04, 0.49, 0.80], [2.78, 1.65, 0.97], [3.29, 0.17, 0.58]),
  tnau("tnau-pearl-millet", "Pearl millet", "Mixed black calcareous", "pearl millet", [8.83, 0.41, 0.55], [3.75, 1.10, 0.62], [4.57, 0.15, 0.48]),
  tnau("tnau-little-millet", "Little millet", "Red sandy loam", "little millet", [5.97, 0.45, 0], [3.80, 3.32, 0], [7.08, 0.58, 0]),
  tnau("tnau-blackgram", "Blackgram", "Mixed black calcareous", "blackgram", [25.07, 0.71, 0], [15.44, 5.48, 0], [11.00, 0.19, 0]),
  tnau("tnau-greengram", "Greengram", "Red sandy loam", "greengram", [25.07, 0.71, 0], [15.44, 5.48, 0], [11.00, 0.19, 0]),
  tnau("tnau-groundnut-irugur", "Groundnut", "Red sandy loam", "groundnut", [6.54, 0.56, 0.69], [3.80, 3.32, 0.77], [8.35, 0.65, 0.87]),
  tnau("tnau-groundnut-somayanur", "Groundnut", "Somayanur red sandy clay loam", "groundnut", [6.54, 0.51, 1.10], [4.19, 2.95, 0.77], [5.47, 0.33, 0.87]),
  tnau("tnau-groundnut-laterite", "Groundnut", "Low level laterite", "groundnut", [7.50, 0.33, 0.45], [3.50, 1.67, 0.55], [6.78, 0.31, 0.43]),
  tnau("tnau-sunflower", "Sunflower", "Mixed black calcareous", "sunflower", [9.60, 0.49, 0.68], [4.20, 1.87, 0.80], [9.24, 0.45, 0.64]),
  tnau("tnau-gingelly", "Gingelly", "Black alluvium", "gingelly", [13.07, 0.46, 0], [6.30, 1.79, 0], [12.80, 0.47, 0]),
  tnau("tnau-sugarcane-black-calcareous", "Sugarcane", "Mixed black calcareous", "sugarcane", [4.17, 1.09, 1.11], [1.01, 2.56, 1.01], [3.44, 0.84, 1.03], { targetYieldUnit: "t/ha" }),
  tnau("tnau-sugarcane-gadillum", "Sugarcane", "Gadillum series", "sugarcane", [4.06, 0.74, 0.87], [0.71, 1.09, 0.72], [2.67, 0.57, 1.33], { targetYieldUnit: "t/ha" }),
  tnau("tnau-sugarcane-irugur", "Sugarcane", "Red sandy loam", "sugarcane", [3.42, 0.56, 0.93], [1.15, 1.94, 0.98], [3.16, 0.73, 0.99], { targetYieldUnit: "t/ha" }),
  tnau("tnau-cotton-varieties", "Cotton", "Varieties, mixed black calcareous", "cotton", [7.66, 0.43, 0.71], [3.22, 3.27, 0.87], [5.97, 0.50, 0.66]),
  tnau("tnau-cotton-rainfed-pilamedu", "Cotton", "Hybrid rainfed, Pilamedu series", "cotton", [5.35, 0.24, 0.53], [3.67, 1.99, 0.84], [3.83, 0.13, 0.55]),
  tnau("tnau-onion-small", "Onion", "Aggregatum small onion, red sandy loam", "onion", [0.99, 0.37, 0.58], [0.58, 1.43, 0.69], [0.67, 0.25, 0.44]),
  tnau("tnau-big-onion", "Big onion", "Irugur series", "big onion", [0.80, 0.60, 0.84], [0.58, 2.10, 0.87], [0.61, 0.33, 0.70]),
  tnau("tnau-bhendi", "Bhendi", "Mixed black calcareous", "bhendi", [1.15, 0.46, 0.81], [0.52, 1.31, 0.87], [1.77, 0.64, 0.91]),
  tnau("tnau-cabbage", "Cabbage", "Irugur series", "cabbage", [0.55, 0.89, 0.76], [0.29, 2.75, 0.86], [0.36, 0.31, 0.56]),
  tnau("tnau-tomato", "Tomato", "Palaviduthi series", "tomato", [0.45, 0.63, 0.72], [0.42, 4.18, 0.73], [0.40, 0.48, 0.66]),
  tnau("tnau-brinjal", "Brinjal", "Palaviduthi series", "brinjal", [0.69, 0.72, 0.64], [0.41, 3.57, 0.72], [0.65, 0.34, 0.52]),
  tnau("tnau-beetroot", "Beetroot", "Palathurai series", "beetroot", [0.64, 0.65, 0.96], [0.52, 1.58, 0.92], [0.61, 0.27, 0.92]),
  tnau("tnau-radish", "Radish", "Palathurai series", "radish", [0.69, 0.74, 1.03], [0.28, 1.35, 1.15], [0.43, 0.21, 0.64]),
  tnau("tnau-potato", "Potato", "Laterite Ooty series", "potato", [0.70, 0.24, 0.41], [1.44, 0.55, 0.95], [0.72, 0.25, 0.39]),
  tnau("tnau-cauliflower", "Cauliflower", "Red sandy loam", "cauliflower", [0.93, 0.79, 0.63], [0.44, 1.74, 0.85], [0.44, 0.18, 0.46]),
  tnau("tnau-carrot", "Carrot", "Ooty series", "carrot", [0.48, 0.17, 0.33], [1.11, 1.17, 0.31], [0.83, 0.40, 0.43]),
  tnau("tnau-tapioca", "Tapioca", "Thulukkanur red sandy loam", "tapioca", [0.56, 0.61, 0.81], [0.35, 1.80, 0.53], [0.94, 0.67, 0.70]),
  tnau("tnau-chilli", "Chilli", "Irugur series", "chilli", [8.29, 0.32, 0], [7.13, 5.24, 0], [5.86, 0.15, 0]),
  tnau("tnau-turmeric", "Turmeric", "Red sandy loam", "turmeric", [1.11, 0.83, 0.98], [0.57, 5.21, 1.02], [0.83, 0.50, 0.61]),
  tnau("tnau-ashwagandha", "Ashwagandha", "Mixed black calcareous", "ashwagandha", [24.77, 0.61, 0.74], [18.33, 2.68, 0.84], [18.12, 0.21, 0.59]),
  tnau("tnau-glory-lily", "Glory lily", "Palaviduthi series", "glory lily", [41.45, 0.53, 0.71], [23.08, 1.92, 0.88], [30.45, 0.21, 0.64]),
  tnau("tnau-chrysanthemum", "Chrysanthemum", "Somayanur red sandy clay loam", "chrysanthemum", [2.01, 1.14, 0.67], [1.08, 2.56, 0.69], [1.57, 0.74, 0.62]),
];

export const STCR_FORMULAS = [...CORE_FORMULAS, ...TNAU_FORMULAS];

export const STCR_SOURCES = SOURCES;

function tnau(id, crop, variant, targetKey, n, p, k, options = {}) {
  return formula(id, crop, variant, targetKey, SOURCES.tnau, DEFAULT_TARGETS[targetKey], options.targetYieldUnit || "q/ha", n, p, k, {
    validationStatus: options.validationStatus || "verified",
    targetSource: options.targetSource || "project_demo_default",
    warnings: [
      "Target yield uses a project demo default unless overridden by the user.",
      ...(options.warnings || []),
    ],
  });
}

function formula(id, crop, variant, targetKey, source, defaultTargetYield, targetYieldUnit, n, p, k, options = {}) {
  return {
    id,
    crop,
    variant,
    source,
    defaultTargetYield,
    targetYieldUnit,
    validationStatus: options.validationStatus || "verified",
    targetSource: options.targetSource || "source",
    organicTermMode: options.organicTermMode || "nutrient_kg_ha",
    coefficients: {
      n: coefficient(n),
      p: coefficient(p),
      k: coefficient(k),
    },
    warnings: options.warnings || [],
  };
}

function coefficient([target, soil, organic]) {
  return {
    target,
    soil,
    organic,
  };
}
