import { STCR_FORMULAS } from "./stcrFormulaRegistry.js";

const KG_HA_TO_KG_ACRE = 0.404686;
const DAP_N_FRACTION = 0.18;
const DAP_P2O5_FRACTION = 0.46;
const UREA_N_FRACTION = 0.46;
const MOP_K2O_FRACTION = 0.60;

const SOIL_CLASS_LIMITS = {
  n: { lowBelow: 280, highAbove: 560 },
  p: { lowBelow: 10, highAbove: 25 },
  k: { lowBelow: 108, highAbove: 280 },
};

const SCORE_WEIGHTS = {
  n: 0.4,
  p: 0.3,
  k: 0.3,
};

/**
 * Adds multi-crop STCR ranking to the ESP32 JSON without changing the firmware contract.
 */
export function enrichWithStcrRanking(payload, options = {}) {
  if (!payload?.ok) {
    return payload;
  }

  const npk = extractNpk(payload);
  const organic = normalizeOrganicInputs(options.organic || {});
  const targetOverrides = options.targetYields || {};
  const formulas = selectFormulas(options.formulaIds);
  const rankedCrops = formulas
    .map((record) => evaluateFormula(record, npk, organic, targetOverrides[record.id] || targetOverrides[record.crop]))
    .sort((left, right) => right.confidence_percent - left.confidence_percent);

  return {
    ...payload,
    soil_classification: classifySoil(npk),
    stcr_multi_crop: {
      input_npk_kg_ha: npk,
      assumptions: [
        "Soil N, P and K are interpreted as available nutrient values in kg/ha from the ESP32 NPK sensor.",
        "Organic manure contribution is treated as zero unless the API caller supplies organic nutrient values.",
        "TNAU entries with project demo target yields should be adjusted for local variety, season and district before real field use.",
      ],
      ranked_crops: rankedCrops,
      top_crop: rankedCrops[0] || null,
      formula_count: rankedCrops.length,
    },
  };
}

/**
 * Runs the STCR equations directly from NPK values for UI demos and tests.
 */
export function rankCropsFromNpk(npk, options = {}) {
  return enrichWithStcrRanking({ ok: true, sensor: toSensorPayload(npk) }, options);
}

export function classifySoil(npk) {
  return {
    n: classifyNutrient(npk.n_kg_ha, SOIL_CLASS_LIMITS.n),
    p: classifyNutrient(npk.p_kg_ha, SOIL_CLASS_LIMITS.p),
    k: classifyNutrient(npk.k_kg_ha, SOIL_CLASS_LIMITS.k),
  };
}

function evaluateFormula(record, npk, organic, targetOverride) {
  const targetYield = toPositiveNumber(targetOverride) || record.defaultTargetYield;
  const nKgHa = calculateRequirement(record.coefficients.n, targetYield, npk.n_kg_ha, organic.n);
  const p2o5KgHa = calculateRequirement(record.coefficients.p, targetYield, npk.p_kg_ha, organic.p);
  const k2oKgHa = calculateRequirement(record.coefficients.k, targetYield, npk.k_kg_ha, organic.k);
  const maxima = {
    n: Math.max(record.coefficients.n.target * targetYield, 0),
    p: Math.max(record.coefficients.p.target * targetYield, 0),
    k: Math.max(record.coefficients.k.target * targetYield, 0),
  };
  const gaps = {
    n: ratio(nKgHa, maxima.n),
    p: ratio(p2o5KgHa, maxima.p),
    k: ratio(k2oKgHa, maxima.k),
  };
  const totalGap = clamp01(SCORE_WEIGHTS.n * gaps.n + SCORE_WEIGHTS.p * gaps.p + SCORE_WEIGHTS.k * gaps.k);

  return {
    formula_id: record.id,
    crop: record.crop,
    variant: record.variant,
    confidence_percent: round2(100 * (1 - totalGap)),
    target_yield: targetYield,
    target_yield_unit: record.targetYieldUnit,
    target_source: record.targetSource,
    nutrient_gap_score: round4(totalGap),
    soil_fertility_class: classifySoil(npk),
    fertilizer_requirement_kg_ha: {
      n: round2(nKgHa),
      p2o5: round2(p2o5KgHa),
      k2o: round2(k2oKgHa),
    },
    fertilizer_products: estimateProducts(nKgHa, p2o5KgHa, k2oKgHa),
    source: record.source,
    warnings: record.warnings,
  };
}

function estimateProducts(nKgHa, p2o5KgHa, k2oKgHa) {
  const dapKgHa = p2o5KgHa / DAP_P2O5_FRACTION;
  const nitrogenFromDapKgHa = dapKgHa * DAP_N_FRACTION;
  const ureaKgHa = Math.max(0, nKgHa - nitrogenFromDapKgHa) / UREA_N_FRACTION;
  const mopKgHa = k2oKgHa / MOP_K2O_FRACTION;

  return {
    kg_ha: {
      urea: round2(ureaKgHa),
      dap: round2(dapKgHa),
      mop: round2(mopKgHa),
    },
    kg_acre: {
      urea: round2(ureaKgHa * KG_HA_TO_KG_ACRE),
      dap: round2(dapKgHa * KG_HA_TO_KG_ACRE),
      mop: round2(mopKgHa * KG_HA_TO_KG_ACRE),
    },
  };
}

function calculateRequirement(coefficients, targetYield, soilValue, organicValue) {
  const requirement =
    coefficients.target * targetYield -
    coefficients.soil * soilValue -
    coefficients.organic * organicValue;

  return Math.max(0, requirement);
}

function classifyNutrient(value, limits) {
  if (value < limits.lowBelow) {
    return "low";
  }
  if (value > limits.highAbove) {
    return "high";
  }
  return "medium";
}

function extractNpk(payload) {
  return toSensorPayload(payload.sensor || payload.npk || payload);
}

function toSensorPayload(input) {
  return {
    n_kg_ha: toFiniteNumber(input.n_kg_ha ?? input.nitrogenKgHa ?? input.nitrogen ?? input.n),
    p_kg_ha: toFiniteNumber(input.p_kg_ha ?? input.phosphorusKgHa ?? input.phosphorus ?? input.p),
    k_kg_ha: toFiniteNumber(input.k_kg_ha ?? input.potassiumKgHa ?? input.potassium ?? input.k),
  };
}

function normalizeOrganicInputs(input) {
  return {
    n: Math.max(0, toFiniteNumber(input.n_kg_ha ?? input.n ?? 0)),
    p: Math.max(0, toFiniteNumber(input.p_kg_ha ?? input.p ?? 0)),
    k: Math.max(0, toFiniteNumber(input.k_kg_ha ?? input.k ?? 0)),
  };
}

function selectFormulas(formulaIds) {
  if (!Array.isArray(formulaIds) || formulaIds.length === 0) {
    return STCR_FORMULAS;
  }

  const allowed = new Set(formulaIds);
  return STCR_FORMULAS.filter((record) => allowed.has(record.id));
}

function ratio(value, maximum) {
  if (maximum <= 0) {
    return 0;
  }
  return clamp01(value / maximum);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function toPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function toFiniteNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("NPK values must be non-negative numbers");
  }
  return number;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round4(value) {
  return Math.round(value * 10_000) / 10_000;
}
