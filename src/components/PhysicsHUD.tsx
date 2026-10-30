/**
 * Real-time Physical Telemetry HUD
 * Displays active particles, stable hadrons, compute ops, kinetic energy, and recognized words.
 */

import React from 'react';
import { ComputerTelemetry } from '../types/physics';
import { Atom, Zap, Gauge, Flame, Sparkles } from 'lucide-react';

interface PhysicsHUDProps {
  telemetry: ComputerTelemetry;
}

export const PhysicsHUD: React.FC<PhysicsHUDProps> = ({ telemetry }) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {/* Particle Quarks / Leptons */}
      <div
        className="bg-[#0b0f19] border border-slate-800 rounded-lg p-2.5 transition-colors hover:border-sky-800/60"
        title="Active character state vectors in the continuous simulation chamber"
      >
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
          <Atom className="w-3.5 h-3.5 text-sky-400" />
          <span>Active Particles</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-slate-100">
            {telemetry.particleCount}
          </span>
          <span className="text-[10px] text-slate-500">quarks/leptons</span>
        </div>
        <div className="text-[9px] text-sky-400/80 font-mono mt-0.5 truncate">
          Char state vectors
        </div>
      </div>

      {/* Bound Hadrons (Words) */}
      <div
        className="bg-[#0b0f19] border border-slate-800 rounded-lg p-2.5 transition-colors hover:border-amber-800/60"
        title="Lexicon-recognized character chains bonded by Yukawa / NPMI bigram forces"
      >
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Synthesized Words</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-amber-300">
            {telemetry.stableHadrons}
          </span>
          <span className="text-[10px] text-slate-500">/ {telemetry.wordCount} hadrons</span>
        </div>
        <div className="text-[9px] text-amber-400/80 font-mono mt-0.5 truncate">
          Lexical NPMI clusters
        </div>
      </div>

      {/* Neuromorphic Spike Frequency */}
      <div
        className="bg-[#0b0f19] border border-slate-800 rounded-lg p-2.5 transition-colors hover:border-emerald-800/60"
        title="Biological Leaky Integrate-and-Fire (LIF) neuron membrane threshold crossings (-50 mV)"
      >
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>Spike Freq</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-emerald-400">
            {telemetry.spikeRateHz}
          </span>
          <span className="text-[10px] text-slate-500">Hz</span>
        </div>
        <div className="text-[9px] text-emerald-400/80 font-mono mt-0.5 truncate">
          LIF threshold resets
        </div>
      </div>

      {/* Kinetic Energy */}
      <div
        className="bg-[#0b0f19] border border-slate-800 rounded-lg p-2.5 transition-colors hover:border-rose-800/60"
        title="Kinematic velocity variance across chamber particles"
      >
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
          <Flame className="w-3.5 h-3.5 text-rose-400" />
          <span>Kinetic Energy</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-rose-400">
            {telemetry.totalKineticEnergy}
          </span>
          <span className="text-[10px] text-slate-500">GeV</span>
        </div>
        <div className="text-[9px] text-rose-400/80 font-mono mt-0.5 truncate">
          Velocity dispersion
        </div>
      </div>

      {/* Semantic Entropy */}
      <div
        className="bg-[#0b0f19] border border-slate-800 rounded-lg p-2.5 transition-colors hover:border-purple-800/60"
        title="Shannon information entropy H = -sum(p * log2(p)) over active particle distributions"
      >
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
          <Gauge className="w-3.5 h-3.5 text-purple-400" />
          <span>Entropy</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-purple-300">
            {telemetry.entropy}
          </span>
          <span className="text-[10px] text-slate-500">bits</span>
        </div>
        <div className="text-[9px] text-purple-400/80 font-mono mt-0.5 truncate">
          Shannon entropy H
        </div>
      </div>

      {/* Compute Operations / Sec */}
      <div
        className="bg-[#0b0f19] border border-slate-800 rounded-lg p-2.5 transition-colors hover:border-cyan-800/60"
        title="Total pairwise N-body, Lorentz, Coulomb, and memristor crossbar floating-point operations per second"
      >
        <div className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase font-semibold">
          <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block animate-ping" />
          <span>Neuromorphic Ops</span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl font-bold font-mono text-cyan-300">
            {(telemetry.opsPerSecond / 1000).toFixed(1)}k
          </span>
          <span className="text-[10px] text-slate-500">ops/s</span>
        </div>
        <div className="text-[9px] text-cyan-400/80 font-mono mt-0.5 truncate">
          SpMV / N-body FLOPS
        </div>
      </div>
    </div>
  );
};
