import React from 'react';
import { NODE_CATEGORY_META } from '../engine/simulator.js';
import {
  Sliders,
  Trash2,
  Flame,
  Cpu,
  Layers,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

export default function NodeInspector({
  node,
  nodeMetrics,
  edges,
  allNodes,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdgeWeight,
  onDeleteEdge,
}) {
  if (!node) {
    return (
      <div className="w-80 bg-[#0b0e16] border-l border-slate-800/80 p-4 flex flex-col justify-center items-center text-center text-slate-500 text-xs">
        <Sliders className="w-6 h-6 mb-2 text-slate-600" />
        Select any node on the DAG canvas to inspect its queueing dynamics, replica pool, and token economics.
      </div>
    );
  }

  const meta = NODE_CATEGORY_META[node.category] || NODE_CATEGORY_META.worker;
  const m = nodeMetrics || {};
  const outgoingEdges = (edges || []).filter((e) => e.from === node.id);
  const nodeMap = new Map((allNodes || []).map((n) => [n.id, n]));

  return (
    <aside className="w-80 bg-[#0b0e16] border-l border-slate-800/80 flex flex-col h-full overflow-y-auto select-none">
      {/* Inspector Header */}
      <div className="px-4 py-3 bg-[#0f131f] border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Service Inspector
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onUpdateNode(node.id, { fault: !node.fault })}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border transition ${
              node.fault
                ? 'bg-rose-500/25 text-rose-300 border-rose-500/50'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
            }`}
            title="Inject local fault on this node"
          >
            <Flame className="w-3 h-3" />
            {node.fault ? 'Fault ON' : 'Inject Fault'}
          </button>
          {allNodes.length > 2 && (
            <button
              onClick={() => onDeleteNode(node.id)}
              className="p-1 rounded bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700/80 transition"
              title="Remove node from topology"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4 text-xs">
        {/* Identity & Category */}
        <div className="space-y-2">
          <label className="block text-[11px] text-slate-400 font-medium">
            Service Name
          </label>
          <input
            type="text"
            value={node.name}
            onChange={(e) => onUpdateNode(node.id, { name: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-md bg-[#07090f] border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
          />

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="block text-[10.5px] text-slate-400 mb-1">
                Archetype
              </label>
              <select
                value={node.category}
                onChange={(e) => onUpdateNode(node.id, { category: e.target.value })}
                className="w-full px-2 py-1.5 rounded-md bg-[#07090f] border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
              >
                {Object.entries(NODE_CATEGORY_META).map(([key, val]) => (
                  <option key={key} value={key}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10.5px] text-slate-400 mb-1">
                Retry Budget
              </label>
              <input
                type="number"
                min="0"
                max="5"
                value={node.retries ?? 1}
                onChange={(e) =>
                  onUpdateNode(node.id, { retries: Math.max(0, Number(e.target.value)) })
                }
                className="w-full px-2.5 py-1.5 rounded-md bg-[#07090f] border border-slate-800 text-slate-100 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Live Node Telemetry Readout Card */}
        <div className="p-3 rounded-lg bg-[#080a10] border border-slate-800/90 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Arrival / Effective Cap</span>
            <span className="font-mono text-slate-200 font-semibold">
              {m.arrivalRps} / {m.capacityRps} RPS
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Kingman Queue Wait</span>
            <span className="font-mono text-amber-300 font-semibold">
              +{m.queueWaitMs} ms
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Node Latency (p50 / p95 / p99)</span>
            <span className="font-mono text-cyan-300 font-semibold">
              {Math.round(m.p50Ms)} / {Math.round(m.p95Ms)} / {Math.round(m.p99Ms)} ms
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Hourly Node Run-Rate</span>
            <span className="font-mono text-emerald-300 font-semibold">
              ${(m.totalCostPerHour || 0).toFixed(2)}/hr
            </span>
          </div>
        </div>

        {/* Scaling & Queueing Sliders */}
        <div className="space-y-3 pt-1 border-t border-slate-800/80">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            Replica Pool & M/M/c Queueing
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">Active Replicas (Pods)</span>
              <span className="font-mono text-cyan-300 font-semibold">
                {node.replicas} pods ({m.effectiveReplicas} healthy)
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="24"
              value={node.replicas || 1}
              onChange={(e) =>
                onUpdateNode(node.id, { replicas: Number(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">Max RPS Capacity / Pod</span>
              <span className="font-mono text-slate-200">
                {node.maxRpsPerReplica} req/s
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="400"
              step="5"
              value={node.maxRpsPerReplica || 80}
              onChange={(e) =>
                onUpdateNode(node.id, { maxRpsPerReplica: Number(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">Base Service Latency</span>
              <span className="font-mono text-slate-200">{node.baseLatencyMs} ms</span>
            </div>
            <input
              type="range"
              min="1"
              max="200"
              step="1"
              value={node.baseLatencyMs || 15}
              onChange={(e) =>
                onUpdateNode(node.id, { baseLatencyMs: Number(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">Service Jitter CV (Tail Spread)</span>
              <span className="font-mono text-slate-200">
                {(node.jitterCv || 0.3).toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.05"
              max="1.2"
              step="0.05"
              value={node.jitterCv || 0.3}
              onChange={(e) =>
                onUpdateNode(node.id, { jitterCv: Number(e.target.value) })
              }
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Category-Specific Controls: Cache Hit Rate or LLM Token Economics */}
        {node.category === 'cache' && (
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300 uppercase tracking-wider">
              <Layers className="w-3.5 h-3.5" />
              Semantic Cache Short-Circuit
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Cache Hit Ratio</span>
                <span className="font-mono text-emerald-300 font-semibold">
                  {Math.round((node.cacheHitRate || 0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="0.95"
                step="0.02"
                value={node.cacheHitRate || 0}
                onChange={(e) =>
                  onUpdateNode(node.id, { cacheHitRate: Number(e.target.value) })
                }
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <p className="text-[10.5px] text-slate-500 mt-1">
                Cache hits return immediately and shed load from downstream LLM / DB stages.
              </p>
            </div>
          </div>
        )}

        {node.category === 'llm' && (
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-pink-300 uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              LLM Prefill / Decode & Token Pricing
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Prompt Context Tokens</span>
                <span className="font-mono text-pink-300">
                  {node.promptTokens || 1024} tok
                </span>
              </div>
              <input
                type="range"
                min="128"
                max="8192"
                step="128"
                value={node.promptTokens || 1024}
                onChange={(e) =>
                  onUpdateNode(node.id, { promptTokens: Number(e.target.value) })
                }
                className="w-full accent-pink-400 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Completion Output Tokens</span>
                <span className="font-mono text-pink-300">
                  {node.completionTokens || 192} tok
                </span>
              </div>
              <input
                type="range"
                min="32"
                max="2048"
                step="32"
                value={node.completionTokens || 192}
                onChange={(e) =>
                  onUpdateNode(node.id, { completionTokens: Number(e.target.value) })
                }
                className="w-full accent-pink-400 cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* Outgoing Routing Edges */}
        <div className="space-y-2 pt-2 border-t border-slate-800/80">
          <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
            Downstream Fan-Out Edges ({outgoingEdges.length})
          </div>
          {outgoingEdges.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Terminal sink node (no downstream edges). Use "Link Edge" on canvas to connect.
            </p>
          ) : (
            <div className="space-y-2">
              {outgoingEdges.map((edge) => {
                const target = nodeMap.get(edge.to);
                return (
                  <div
                    key={edge.id}
                    className="p-2 rounded bg-[#080a10] border border-slate-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-200 truncate">
                        → {target?.name || edge.to}
                      </span>
                      <button
                        onClick={() => onDeleteEdge(edge.id)}
                        className="text-[10px] text-slate-500 hover:text-rose-400"
                      >
                        Unlink
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-mono w-20">
                        Route: {Math.round((edge.weight || 1) * 100)}%
                      </span>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={edge.weight || 1.0}
                        onChange={(e) =>
                          onUpdateEdgeWeight(edge.id, Number(e.target.value))
                        }
                        className="flex-1 accent-cyan-400 cursor-pointer"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
