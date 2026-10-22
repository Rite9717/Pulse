import React, { useState } from 'react';
import {
  generateDockerComposeSpec,
  generateKubernetesHpaSpec,
  generateArchitectureRFC,
} from '../engine/exporters.js';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  Check,
  Download,
  TrendingUp,
  Wrench,
  DollarSign,
} from 'lucide-react';

export default function TelemetryWorkbench({
  topology,
  simulation,
  sweepData,
  chaosState,
  diagnostics,
  onApplyFix,
  onSelectNode,
}) {
  const [activeTab, setActiveTab] = useState('curves');
  const [specFormat, setSpecFormat] = useState('compose');
  const [copiedSpec, setCopiedSpec] = useState(false);

  const maxSweepLatency = Math.max(
    600,
    ...sweepData.map((d) => Math.max(d.nominalP95, d.chaosP95))
  );

  const generatedSpec =
    specFormat === 'compose'
      ? generateDockerComposeSpec(topology, simulation)
      : specFormat === 'k8s'
      ? generateKubernetesHpaSpec(topology, simulation)
      : generateArchitectureRFC(topology, simulation, chaosState, diagnostics);

  const handleCopySpec = () => {
    navigator.clipboard?.writeText(generatedSpec);
    setCopiedSpec(true);
    setTimeout(() => setCopiedSpec(false), 1800);
  };

  const handleDownloadSpec = () => {
    const ext = specFormat === 'rfc' ? 'md' : 'yaml';
    const blob = new Blob([generatedSpec], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topology.id || 'pulse-topology'}-${specFormat}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col bg-[#0b0e16] border border-slate-800/80 rounded-xl overflow-hidden flex-1 min-h-[260px]">
      {/* Tab Bar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0f131f] border-b border-slate-800/80">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('curves')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'curves'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Load Sweep & Queue Saturation Curve
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'matrix'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Service Queue & Token Economics Matrix
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'diagnostics'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            SRE Advisor & Auto-Remediation
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-slate-800 text-cyan-300">
              {diagnostics.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('specs')}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
              activeTab === 'specs'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Executable Infra & RFC Exporter
          </button>
        </div>

        <div className="hidden md:flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span>
            SLO Target:{' '}
            <strong className="text-slate-200">{simulation.sloLatencyTargetMs}ms</strong>
          </span>
          <span>·</span>
          <span>
            Peak Queue Util:{' '}
            <strong
              className={
                simulation.maxUtilization > 0.9
                  ? 'text-rose-400'
                  : simulation.maxUtilization > 0.75
                  ? 'text-amber-300'
                  : 'text-emerald-400'
              }
            >
              {Math.round(simulation.maxUtilization * 100)}%
            </strong>
          </span>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-3.5 flex-1 overflow-auto">
        {activeTab === 'curves' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Left SVG Line Plot */}
            <div className="lg:col-span-8 bg-[#080a10] border border-slate-800/80 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">
                    End-to-End p95 Latency vs. Ingress Load Sweep (Kingman VUT Queueing Curve)
                  </span>
                  <span className="ml-2 text-slate-500 text-[11px]">
                    ({sweepData[0]?.rps} RPS → {sweepData[sweepData.length - 1]?.rps} RPS)
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1 text-cyan-300">
                    <span className="w-3 h-0.5 bg-cyan-400 inline-block" /> Nominal p95 (ms)
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-300">
                    <span className="w-3 h-0.5 bg-rose-500 inline-block" /> Active Chaos / Fault p95
                  </span>
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <span className="w-3 h-0.5 border-b border-dashed border-amber-400 inline-block" />{' '}
                    SLO ({simulation.sloLatencyTargetMs}ms)
                  </span>
                </div>
              </div>

              <svg viewBox="0 0 720 185" className="w-full h-[175px]">
                {/* Horizontal grid lines */}
                {[0.2, 0.5, 0.8].map((ratio, i) => {
                  const y = 20 + ratio * 135;
                  const val = Math.round(maxSweepLatency * (1 - ratio));
                  return (
                    <g key={i}>
                      <line
                        x1="48"
                        y1={y}
                        x2="695"
                        y2={y}
                        stroke="rgba(148, 163, 184, 0.1)"
                        strokeWidth="1"
                      />
                      <text
                        x="42"
                        y={y + 3}
                        textAnchor="end"
                        fill="#64748b"
                        fontSize="9.5"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {val}ms
                      </text>
                    </g>
                  );
                })}

                {/* SLO Threshold Line */}
                {(() => {
                  const sloRatio = Math.min(
                    1,
                    Math.max(0, 1 - simulation.sloLatencyTargetMs / maxSweepLatency)
                  );
                  const sloY = 20 + sloRatio * 135;
                  return (
                    <g>
                      <line
                        x1="48"
                        y1={sloY}
                        x2="695"
                        y2={sloY}
                        stroke="#f59e0b"
                        strokeWidth="1.2"
                        strokeDasharray="5 4"
                      />
                      <text
                        x="692"
                        y={sloY - 4}
                        textAnchor="end"
                        fill="#fbbf24"
                        fontSize="9"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        SLO Target ({simulation.sloLatencyTargetMs}ms)
                      </text>
                    </g>
                  );
                })()}

                {/* Polyline for Nominal p95 */}
                {(() => {
                  const pts = sweepData
                    .map((d, i) => {
                      const x = 55 + (i / (sweepData.length - 1)) * 630;
                      const y =
                        20 +
                        (1 - Math.min(maxSweepLatency, d.nominalP95) / maxSweepLatency) * 135;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.2"
                      points={pts}
                    />
                  );
                })()}

                {/* Polyline for Chaos p95 */}
                {(() => {
                  const pts = sweepData
                    .map((d, i) => {
                      const x = 55 + (i / (sweepData.length - 1)) * 630;
                      const y =
                        20 +
                        (1 - Math.min(maxSweepLatency, d.chaosP95) / maxSweepLatency) * 135;
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      fill="none"
                      stroke="#f43f5e"
                      strokeWidth="2.2"
                      strokeDasharray="4 2"
                      points={pts}
                    />
                  );
                })()}

                {/* Data Points & X-axis labels */}
                {sweepData.map((d, i) => {
                  const x = 55 + (i / (sweepData.length - 1)) * 630;
                  const yNom =
                    20 + (1 - Math.min(maxSweepLatency, d.nominalP95) / maxSweepLatency) * 135;
                  const yChaos =
                    20 + (1 - Math.min(maxSweepLatency, d.chaosP95) / maxSweepLatency) * 135;
                  const isCurrent = i === 4; // 1.0x multiplier is index 4

                  return (
                    <g key={d.rps}>
                      {isCurrent && (
                        <line
                          x1={x}
                          y1="16"
                          x2={x}
                          y2="156"
                          stroke="rgba(56, 189, 248, 0.35)"
                          strokeWidth="1.5"
                        />
                      )}
                      <circle cx={x} cy={yNom} r={isCurrent ? 4.2 : 3} fill="#38bdf8" />
                      <circle cx={x} cy={yChaos} r={isCurrent ? 4.2 : 3} fill="#f43f5e" />
                      <text
                        x={x}
                        y="172"
                        textAnchor="middle"
                        fill={isCurrent ? '#38bdf8' : '#94a3b8'}
                        fontWeight={isCurrent ? '700' : '400'}
                        fontSize="9.5"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {d.rps}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Right Quick Remediation & Bottleneck Summary */}
            <div className="lg:col-span-4 flex flex-col gap-2.5">
              <div className="p-3 rounded-lg bg-[#0f1420] border border-slate-800/90">
                <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1">
                  Primary Queue Bottleneck
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-100">
                    {simulation.bottleneckNodeName}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-mono font-semibold ${
                      simulation.maxUtilization > 0.9
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {Math.round(simulation.maxUtilization * 100)}% Util
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {diagnostics[0]?.detail}
                </p>
                {diagnostics[0]?.fixAction && (
                  <button
                    onClick={() => onApplyFix(diagnostics[0].fixAction)}
                    className="mt-2.5 w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-medium transition"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Auto-Apply Fix: {diagnostics[0].recommendation.slice(0, 44)}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-[#0f1420] border border-slate-800/80">
                  <div className="text-[10.5px] text-slate-400">Token Throughput</div>
                  <div className="text-sm font-mono font-semibold text-pink-300 mt-0.5">
                    {(simulation.totalTokensPerSec / 1000).toFixed(1)}k tok/s
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Prefill + Decode
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-[#0f1420] border border-slate-800/80">
                  <div className="text-[10.5px] text-slate-400">Unit Economics</div>
                  <div className="text-sm font-mono font-semibold text-emerald-300 mt-0.5">
                    ${simulation.costPer1kRequests.toFixed(3)} / 1k req
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    ${simulation.monthlyProjectedCost.toLocaleString()}/mo est.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-2 px-2.5">Service Node</th>
                  <th className="py-2 px-2.5">Category</th>
                  <th className="py-2 px-2.5 text-right">Pods</th>
                  <th className="py-2 px-2.5 text-right">Arrival / Cap</th>
                  <th className="py-2 px-2.5 text-right">Queue Util</th>
                  <th className="py-2 px-2.5 text-right">p50 / p95 / p99</th>
                  <th className="py-2 px-2.5 text-right">Drop / Err</th>
                  <th className="py-2 px-2.5 text-right">Tokens/s</th>
                  <th className="py-2 px-2.5 text-right">Cost ($/hr)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(topology.nodes || []).map((node) => {
                  const m = simulation.nodeMetrics[node.id] || {};
                  const utilPct = Math.round((m.utilization || 0) * 100);
                  return (
                    <tr
                      key={node.id}
                      onClick={() => onSelectNode(node.id)}
                      className="hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <td className="py-2 px-2.5 font-sans font-medium text-slate-200">
                        {node.name}
                      </td>
                      <td className="py-2 px-2.5 text-slate-400 uppercase text-[10.5px]">
                        {node.category}
                      </td>
                      <td className="py-2 px-2.5 text-right text-slate-300">
                        {m.effectiveReplicas}/{node.replicas}
                      </td>
                      <td className="py-2 px-2.5 text-right text-slate-300">
                        {Math.round(m.arrivalRps)} / {Math.round(m.capacityRps)} rps
                      </td>
                      <td className="py-2 px-2.5 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10.5px] ${
                            utilPct >= 92
                              ? 'bg-rose-500/20 text-rose-300'
                              : utilPct >= 75
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/15 text-emerald-300'
                          }`}
                        >
                          {utilPct}%
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-right text-slate-300">
                        {Math.round(m.p50Ms)} /{' '}
                        <strong className="text-cyan-300">{Math.round(m.p95Ms)}ms</strong> /{' '}
                        {Math.round(m.p99Ms)}
                      </td>
                      <td className="py-2 px-2.5 text-right text-slate-400">
                        {(m.errorRate * 100).toFixed(2)}%
                      </td>
                      <td className="py-2 px-2.5 text-right text-pink-300">
                        {m.tokensPerSec > 0 ? m.tokensPerSec.toLocaleString() : '—'}
                      </td>
                      <td className="py-2 px-2.5 text-right text-emerald-300 font-semibold">
                        ${(m.totalCostPerHour || 0).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'diagnostics' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {diagnostics.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-[#0e1320] border border-slate-800 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                      {item.severity === 'critical' || item.severity === 'warning' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      {item.title}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {item.nodeName}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">{item.detail}</p>
                  <p className="text-xs text-cyan-300/90 mt-1 font-medium">
                    Recommendation: {item.recommendation}
                  </p>
                </div>

                {item.fixAction && (
                  <div className="mt-2.5 flex justify-end">
                    <button
                      onClick={() => onApplyFix(item.fixAction)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-medium transition"
                    >
                      <Wrench className="w-3 h-3" />
                      Apply Recommended Tuning
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {[
                  { id: 'compose', label: 'docker-compose.yml' },
                  { id: 'k8s', label: 'k8s-deployments-hpa.yaml' },
                  { id: 'rfc', label: 'ARCHITECTURE_RFC.md' },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    onClick={() => setSpecFormat(fmt.id)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition ${
                      specFormat === fmt.id
                        ? 'bg-slate-700 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopySpec}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition"
                >
                  {copiedSpec ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedSpec ? 'Copied!' : 'Copy Spec'}
                </button>
                <button
                  onClick={handleDownloadSpec}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs border border-cyan-500/40 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download File
                </button>
              </div>
            </div>

            <pre className="p-3 rounded-lg bg-[#07090e] border border-slate-800/90 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-[155px] leading-relaxed">
              {generatedSpec}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
