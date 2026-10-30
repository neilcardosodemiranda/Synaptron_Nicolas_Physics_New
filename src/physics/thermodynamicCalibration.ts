/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Thermodynamic Calibration & Token Chemical Potential Module
 *
 * Epistemological Mapping:
 * - "Chemical Potential \mu(w)": Statistical information salience metric (information-theoretic
 *   counterpart to TF-IDF). Weighs tokens by Boltzmann surprisal below structural threshold c*,
 *   normalized Shannon branching entropy (specificity), and sentence-initial prior damping.
 * - "Structural Bosons": Top high-frequency grammatical functional tokens (prepositions, articles,
 *   conjunctions, copulas) whose frequency >= c*.
 * - "Semantic Fermions": Content words with specific branching entropy and lower frequency.
 * - "Pass-1 Calibration": Unsupervised statistical profiling over raw ingested text corpus.
 */

import { getLetterParticleProperties } from '../utils/dictionary';
import { CorpusCalibrationArtifact } from '../types/physics';

export interface CalibrationStatisticsInput {
  wordCounts: Map<string, number>;
  wordForwardEntropy: Map<string, number>;
  wordBackwardEntropy: Map<string, number>;
  wordSentenceStartCounts: Map<string, number>;
  wordRecurrenceIntervals: Map<string, number[]>;
  dynamicLexiconSize: number;
  totalTokens: number;
}

export function computeQuantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

/**
 * Computes statistical / thermodynamic chemical potential \mu(w) for any token.
 * 100% unsupervised — zero hardcoded stopword lists.
 */
export function calculateTokenChemicalPotential(
  rawToken: string,
  calibrationArtifact: CorpusCalibrationArtifact,
  wordCounts: Map<string, number>,
  wordForwardEntropy: Map<string, number>,
  wordBackwardEntropy: Map<string, number>,
  wordSentenceStartCounts: Map<string, number>
): number {
  const u = rawToken.toUpperCase().replace(/[^A-Z0-9'-]/g, '');
  if (!u) return 0.08;

  const count = wordCounts.get(u) || 0;
  const hFwd = wordForwardEntropy.get(u) ?? 0.5;
  const hBwd = wordBackwardEntropy.get(u) ?? 0.5;
  const startCount = wordSentenceStartCounts.get(u) || 0;
  const pStart = count > 0 ? startCount / count : 0;

  // 1. Scale-Invariant Boltzmann Surprisal / Functional Token Damping:
  // Words with count >= c* (top structural bosons) are strongly damped;
  // content words with count < c* (semantic fermions) retain high chemical potential \mu(w).
  const cStar = Math.max(3, calibrationArtifact.structuralCountThresholdC);
  const freqRatio = count / cStar;
  let habituationFactor: number;
  if (freqRatio >= 1.0) {
    habituationFactor = 0.045 / Math.pow(freqRatio, 1.65);
  } else {
    const logGain = Math.log2((cStar + 2) / (count + 1)) / Math.log2(cStar + 2);
    habituationFactor = 0.48 + 0.65 * Math.pow(1.0 - freqRatio, 0.65) * (0.65 + 0.55 * logGain);
  }

  // 2. Normalized Branching Entropy Specificity:
  // Since raw H_fwd grows with log2(count), compare H_fwd against normalized capacity
  // and detect frozen prepositional prefixes (e.g. "according [to]", where hFwd < 1.25 but hBwd > 2.5)
  const maxPossibleH = Math.max(1.5, Math.log2(count + 2));
  const normHfwd = hFwd / maxPossibleH;
  let entropySpecificity =
    normHfwd > 0.78
      ? 0.55 / normHfwd
      : 1.05 + (0.78 - normHfwd) * 0.35;
  if (count >= 15 && hFwd < 1.25 && hBwd > hFwd * 2.2) {
    entropySpecificity *= 0.32;
  }

  // 3. Sentence-initial boundary damping (statistically detects "WHERE", "WHAT", "HOW", "IS")
  // Interrogative / boundary carriers have both high pStart AND high backward entropy hBwd
  const boundaryCarrierDamping =
    pStart >= 0.2 && (hBwd >= 4.4 || count >= cStar * 0.5) && u.length <= 5
      ? 0.14
      : 1.0;

  // 4. Physical particle rest mass contribution (character length & composition)
  let massSum = 0;
  for (let i = 0; i < u.length; i++) {
    massSum += getLetterParticleProperties(u[i], false).mass;
  }
  const massFactor =
    Math.pow(Math.max(1, u.length), 0.72) * (massSum / Math.max(1, u.length)) * 0.45;

  // 5. Directional constraint bonus when backward entropy is tight relative to forward entropy
  const constraintBonus = hBwd < hFwd * 0.75 && count >= 2 ? 1.15 : 1.0;

  return Math.max(
    0.08,
    Math.round(
      habituationFactor *
        entropySpecificity *
        boundaryCarrierDamping *
        massFactor *
        constraintBonus *
        100
    ) / 100
  );
}

/**
 * Runs Pass-1 unsupervised statistical calibration over collected corpus metrics.
 */
export function runPass1ThermodynamicCalibration(
  stats: CalibrationStatisticsInput,
  startTimeMs: number
): CorpusCalibrationArtifact {
  const sortedCounts = Array.from(stats.wordCounts.values()).sort((a, b) => a - b);
  const fwdEntropies = Array.from(stats.wordForwardEntropy.values()).sort((a, b) => a - b);
  const bwdEntropies = Array.from(stats.wordBackwardEntropy.values()).sort((a, b) => a - b);

  const startPriors: number[] = [];
  stats.wordSentenceStartCounts.forEach((sCount, w) => {
    const total = stats.wordCounts.get(w) || 1;
    startPriors.push(sCount / total);
  });
  startPriors.sort((a, b) => a - b);

  const tokenDensityRho =
    Math.round((stats.dynamicLexiconSize / Math.max(1, stats.totalTokens)) * 10000) / 10000;
  const quantile90Count = computeQuantile(sortedCounts, 0.9);
  const topCondensateCount =
    sortedCounts.length > 0 ? sortedCounts[sortedCounts.length - 1] : 10;

  const structuralCountThresholdC = Math.max(
    3,
    Math.round(Math.max(quantile90Count, topCondensateCount * 0.85))
  );
  const sentenceStartPriorP =
    Math.round(Math.max(1e-4, computeQuantile(startPriors, 0.1)) * 10000) / 10000;
  const forwardEntropyBoundaryHfwd =
    Math.round(Math.max(0.5, computeQuantile(fwdEntropies, 0.9)) * 10000) / 10000;
  const backwardEntropyBoundaryHbwd =
    Math.round(Math.max(0.1, computeQuantile(bwdEntropies, 0.1)) * 10000) / 10000;
  const transitionEntropyThTrans =
    Math.round(Math.max(1.15, computeQuantile(fwdEntropies, 0.5)) * 10000) / 10000;

  const allIntervals: number[] = [];
  stats.wordRecurrenceIntervals.forEach((arr) => {
    for (const iv of arr) allIntervals.push(iv);
  });
  const meanInterval =
    allIntervals.length > 0
      ? allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length
      : 24.0;
  const temporalDecayLambda =
    Math.round((1.0 / Math.max(1.0, Math.log(meanInterval + 2.0))) * 10000) / 10000;

  const meanHfwd =
    fwdEntropies.length > 0
      ? fwdEntropies.reduce((a, b) => a + b, 0) / fwdEntropies.length
      : 1.2;
  const meanHbwd =
    bwdEntropies.length > 0
      ? bwdEntropies.reduce((a, b) => a + b, 0) / bwdEntropies.length
      : 1.0;
  const varH =
    fwdEntropies.length > 0
      ? fwdEntropies.reduce((acc, h) => acc + Math.pow(h - meanHfwd, 2), 0) / fwdEntropies.length
      : 0.65;
  const coherenceScalePsi =
    Math.round(
      Math.sqrt(Math.max(0.05, varH)) * Math.log2(stats.dynamicLexiconSize + 2) * 10000
    ) / 10000;
  const directionalSeparationTheta =
    Math.round(Math.abs(meanHfwd - meanHbwd) * 10000) / 10000;

  const varBwd =
    bwdEntropies.length > 0
      ? bwdEntropies.reduce((acc, h) => acc + Math.pow(h - meanHbwd, 2), 0) / bwdEntropies.length
      : 0.6;
  const invBwd = 1.0 / (varBwd + 0.35);
  const invPres = 1.0 / (tokenDensityRho * 8.0 + 0.3);
  const invFwd = 1.0 / (varH + 0.35);
  const invRev = 1.0 / (directionalSeparationTheta + 0.4);
  const weightSum = invBwd + invPres + invFwd + invRev;

  const calibrationTimeMs = Math.max(
    0.12,
    Math.round((performance.now() - startTimeMs) * 100) / 100
  );

  return {
    tokenDensityRho,
    structuralCountThresholdC,
    sentenceStartPriorP,
    forwardEntropyBoundaryHfwd,
    backwardEntropyBoundaryHbwd,
    transitionEntropyThTrans,
    temporalDecayLambda,
    coherenceScalePsi,
    directionalSeparationTheta,
    calibrationTimeMs,
    weights: {
      alphaBackward: Math.round((invBwd / weightSum) * 1000) / 1000,
      betaPresent: Math.round((invPres / weightSum) * 1000) / 1000,
      gammaForward: Math.round((invFwd / weightSum) * 1000) / 1000,
      deltaReverse: Math.round((invRev / weightSum) * 1000) / 1000,
    },
  };
}
