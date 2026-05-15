#pragma once

#include <Arduino.h>

#include "modbus_npk_sensor.h"

struct FertilizerRequirement {
  float nitrogenKgHa = 0.0F;
  float phosphorusKgHa = 0.0F;
  float potassiumKgHa = 0.0F;
};

struct ProductRecommendation {
  float ureaKgHa = 0.0F;
  float dapKgHa = 0.0F;
  float mopKgHa = 0.0F;
  float ureaKgAcre = 0.0F;
  float dapKgAcre = 0.0F;
  float mopKgAcre = 0.0F;
};

struct RiceSuitability {
  float targetYieldQHa = 60.0F;
  FertilizerRequirement requirement;
  ProductRecommendation products;
  float nitrogenScore = 0.0F;
  float phosphorusScore = 0.0F;
  float potassiumScore = 0.0F;
  float confidencePercent = 0.0F;
};

class SoilRecommendationEngine {
 public:
  explicit SoilRecommendationEngine(float targetYieldQHa)
      : targetYieldQHa_(targetYieldQHa) {}

  void setTargetYield(float targetYieldQHa) {
    targetYieldQHa_ = targetYieldQHa > 0.0F ? targetYieldQHa : targetYieldQHa_;
  }

  float targetYieldQHa() const {
    return targetYieldQHa_;
  }

  RiceSuitability evaluateRice(const NpkReading& reading) const {
    RiceSuitability suitability;
    suitability.targetYieldQHa = targetYieldQHa_;

    // STCR rice equations from the Telangana targeted-yield demonstration paper.
    suitability.requirement.nitrogenKgHa =
        clampMinimum(3.58F * targetYieldQHa_ - 0.57F * reading.nitrogenKgHa);
    suitability.requirement.phosphorusKgHa =
        clampMinimum(1.71F * targetYieldQHa_ - 2.46F * reading.phosphorusKgHa);
    suitability.requirement.potassiumKgHa =
        clampMinimum(1.48F * targetYieldQHa_ - 0.16F * reading.potassiumKgHa);

    suitability.nitrogenScore = scoreFromRequirement(
        suitability.requirement.nitrogenKgHa, 3.58F * targetYieldQHa_);
    suitability.phosphorusScore = scoreFromRequirement(
        suitability.requirement.phosphorusKgHa, 1.71F * targetYieldQHa_);
    suitability.potassiumScore = scoreFromRequirement(
        suitability.requirement.potassiumKgHa, 1.48F * targetYieldQHa_);

    suitability.confidencePercent =
        100.0F * ((0.4F * suitability.nitrogenScore) +
                  (0.3F * suitability.phosphorusScore) +
                  (0.3F * suitability.potassiumScore));

    suitability.products = estimateProducts(suitability.requirement);
    return suitability;
  }

 private:
  static constexpr float KgPerHectareToKgPerAcre = 0.404686F;
  static constexpr float UreaNitrogenFraction = 0.46F;
  static constexpr float DapNitrogenFraction = 0.18F;
  static constexpr float DapPhosphorusFraction = 0.46F;
  static constexpr float MopPotassiumFraction = 0.60F;

  float targetYieldQHa_;

  static float clampMinimum(float value) {
    return value < 0.0F ? 0.0F : value;
  }

  static float clamp01(float value) {
    if (value < 0.0F) {
      return 0.0F;
    }
    if (value > 1.0F) {
      return 1.0F;
    }
    return value;
  }

  static float scoreFromRequirement(float requirementKgHa, float maximumKgHa) {
    if (maximumKgHa <= 0.0F) {
      return 0.0F;
    }
    return clamp01(1.0F - requirementKgHa / maximumKgHa);
  }

  static ProductRecommendation estimateProducts(
      const FertilizerRequirement& requirement) {
    ProductRecommendation products;

    // DAP is assigned first because it contributes both phosphorus and nitrogen.
    products.dapKgHa = requirement.phosphorusKgHa / DapPhosphorusFraction;
    const float nitrogenFromDap = products.dapKgHa * DapNitrogenFraction;
    const float remainingNitrogenKgHa =
        clampMinimum(requirement.nitrogenKgHa - nitrogenFromDap);

    products.ureaKgHa = remainingNitrogenKgHa / UreaNitrogenFraction;
    products.mopKgHa = requirement.potassiumKgHa / MopPotassiumFraction;

    products.ureaKgAcre = products.ureaKgHa * KgPerHectareToKgPerAcre;
    products.dapKgAcre = products.dapKgHa * KgPerHectareToKgPerAcre;
    products.mopKgAcre = products.mopKgHa * KgPerHectareToKgPerAcre;
    return products;
  }
};
