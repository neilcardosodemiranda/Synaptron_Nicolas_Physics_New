/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Compressed Sparse Row (CSR) Typed-Array Memory Allocation & Buffer Management
 *
 * Epistemological & CS Mapping:
 * - "CSR Synaptic Matrix": Standard Compressed Sparse Row representation for high-speed sparse
 *   matrix-vector multiplication (SpMV). Rows represent source token somas; column elements store
 *   packed (target_id << 8) | horizon_delay.
 * - "Memristor Conductance G_ij": Float32 weight value in microsiemens (μS).
 * - "ColHorizon": Bitwise packed representation of target token identifier and temporal delay index.
 */

export type MemoryCapacityPreset = '5M' | '25M' | '100M';

export interface CapacityConfig {
  maxSynapses: number;
  maxVocab: number;
  totalVramBytes: number;
  label: string;
  description: string;
}

export const MEMORY_PRESETS: Record<MemoryCapacityPreset, CapacityConfig> = {
  '5M': {
    maxSynapses: 5_242_880,
    maxVocab: 65_536,
    totalVramBytes: 5_242_880 * 8 + 65_536 * 4 * 3, // ~42.7 MB
    label: '5M Memristors (42 MB)',
    description: 'Ultra-lightweight baseline with 65,536 vocabulary soma slots',
  },
  '25M': {
    maxSynapses: 26_214_400,
    maxVocab: 131_072,
    totalVramBytes: 26_214_400 * 8 + 131_072 * 4 * 3, // ~211.2 MB
    label: '25M Memristors (210 MB) [M4 Default]',
    description: 'High-density conversational crossbar with 131,072 vocabulary somas for Apple M4 Unified Memory',
  },
  '100M': {
    maxSynapses: 104_857_600,
    maxVocab: 262_144,
    totalVramBytes: 104_857_600 * 8 + 262_144 * 4 * 3, // ~842.0 MB
    label: '100M Memristors (842 MB) [Bare-Metal Maximum]',
    description: 'Massive Gutenberg library crossbar with 262,144 vocabulary somas & 100M synapses',
  },
};

export interface CsrBuffers {
  rowPtr: Uint32Array;
  rowCounts: Uint32Array;
  colHorizon: Uint32Array;
  conductance: Float32Array;
  headEdge: Int32Array;
  nextEdge: Int32Array;
  edgeSource: Uint32Array;
  synapseLineage: Uint32Array;
  tokenFreq: Uint32Array;
  tokenStartFreq: Uint32Array;
  tokenHfwd: Float32Array;
  tokenMu: Float32Array;
}

/**
 * Allocates contiguous TypedArray buffers for the given memory preset.
 */
export function allocateCsrBuffers(config: CapacityConfig): CsrBuffers {
  return {
    rowPtr: new Uint32Array(config.maxVocab + 1),
    rowCounts: new Uint32Array(config.maxVocab),
    colHorizon: new Uint32Array(config.maxSynapses),
    conductance: new Float32Array(config.maxSynapses),
    headEdge: new Int32Array(config.maxVocab).fill(-1),
    nextEdge: new Int32Array(config.maxSynapses).fill(-1),
    edgeSource: new Uint32Array(config.maxSynapses),
    synapseLineage: new Uint32Array(config.maxSynapses),
    tokenFreq: new Uint32Array(config.maxVocab),
    tokenStartFreq: new Uint32Array(config.maxVocab),
    tokenHfwd: new Float32Array(config.maxVocab),
    tokenMu: new Float32Array(config.maxVocab),
  };
}

/**
 * Packs 24-bit target token ID and 8-bit temporal horizon delta (0..7) into a 32-bit unsigned integer.
 */
export function packColHorizon(targetId: number, horizonDelta: number): number {
  return ((targetId & 0xffffff) << 8) | (horizonDelta & 0xff);
}

/**
 * Unpacks 32-bit unsigned integer into { targetId, horizonDelta }.
 */
export function unpackColHorizon(packed: number): { targetId: number; horizonDelta: number } {
  return {
    targetId: (packed >>> 8) & 0xffffff,
    horizonDelta: packed & 0xff,
  };
}
