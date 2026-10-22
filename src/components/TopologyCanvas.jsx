import React, { useRef, useState } from 'react';
import { NODE_CATEGORY_META } from '../engine/simulator.js';
import {
  Flame,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Link2,
  Plus,
  Copy,
  Check,
} from 'lucide-react';

const NODE_W = 204;
const NODE_H = 104;

export default function TopologyCanvas({
  topology,
  simulation,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  onToggleNodeFault,
  onAddNode,
  onConnectNodes,
  livePacketsEnabled,
}) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [connectSourceId, setConnectSourceId] = useState(null);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const nodes = topology.nodes || [];
  const edges = topology.edges || [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const criticalSet = new Set(simulation.criticalPathNodeIds || []);

  const handlePointerDownNode = (e, node) => {
    e.stopPropagation();
    if (connectSourceId) {
      if (connectSourceId !== node.id) {
        onConnectNodes(connectSourceId, node.id);
      }
      setConnectSourceId(null);
      return;
    }
    onSelectNode(node.id);
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const transformed = pt.matrixTransform(ctm.inverse());
    setDragging({
      nodeId: node.id,
      offsetX: transformed.x - node.x,
      offsetY: transformed.y - node.y,
    });
  };

  const handlePointerMove = (e) => {
    if (!dragging || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const transformed = pt.matrixTransform(ctm.inverse());
    const nextX = Math.max(20, Math.min(1090, Math.round(transformed.x - dragging.offsetX)));
    const nextY = Math.max(24, Math.min(390, Math.round(transformed.y - dragging.offsetY)));
    onMoveNode(dragging.nodeId, nextX, nextY);
  };

  const handlePointerUp = () => {
    if (dragging) setDragging(null);
  };

  const copyCritPath = () => {
    const names = (simulation.criticalPathNodeIds || [])
      .map((id) => nodeMap.get(id)?.name || id)
      .join(' → ');
    navigator.clipboard?.writeText(
      `Critical Path (${simulation.e2eP95Ms}ms p95): ${names}`
    );
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 1800);
  };

  return (
    <div className="relative flex flex-col bg-[#0b0e16] border border-slate-800/80 rounded-xl overflow-hidden select-none">
      {/* Canvas Toolbar */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0f131f] border-b border-slate-800/80 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-200 tracking-wide uppercase text-[11px] flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Live System DAG & Queue Telemetry
          </span>
          <span className="text-slate-500">|</span>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" /> Nominal Flow
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> Critical Path
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-rose-500 inline-block" /> Saturated / Drop
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {connectSourceId ? (
            <button
              onClick={() => setConnectSourceId(null)}
              className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-medium"
            >
              Click Target Node to Link (Esc to cancel)
            </button>
          ) : (
            <button
              onClick={() => setConnectSourceId(selectedNodeId || nodes[0]?.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800/90 hover:bg-slate-700/80 text-slate-200 border border-slate-700 text-[11px] transition"
              title="Link currently selected node to another downstream node"
            >
              <Link2 className="w-3 h-3 text-cyan-400" />
              Link Edge
            </button>
          )}

          <button
            onClick={onAddNode}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-[11px] font-medium transition"
          >
            <Plus className="w-3 h-3" />
            Add Service Node
          </button>

          <button
            onClick={copyCritPath}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-800/70 hover:bg-slate-700/70 text-slate-300 border border-slate-700/80 text-[11px] transition"
            title="Copy critical path summary"
          >
            {copiedSummary ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copiedSummary ? 'Copied' : 'Critical Path'}
          </button>
        </div>
      </div>

      {/* Interactive SVG Stage */}
      <div className="relative w-full h-[395px] bg-[#080a10]">
        <svg
          ref={svgRef}
          viewBox="0 0 1310 510"
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <defs>
            <pattern id="pulse-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path
                d="M 32 0 L 0 0 0 32"
                fill="none"
                stroke="rgba(148, 163, 184, 0.055)"
                strokeWidth="1"
              />
              <circle cx="16" cy="16" r="0.8" fill="rgba(148, 163, 184, 0.12)" />
            </pattern>
            <marker
              id="arrow-nominal"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
            <marker
              id="arrow-critical"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
            </marker>
            <marker
              id="arrow-saturated"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f43f5e" />
            </marker>
          </defs>

          <rect width="1310" height="510" fill="url(#pulse-grid)" />

          {/* Rank/Tier Column Guides */}
          {[
            { x: 55, label: 'STAGE 01 · INGRESS / EDGE' },
            { x: 295, label: 'STAGE 02 · GUARD & BROKER' },
            { x: 545, label: 'STAGE 03 · STATE / RETRIEVAL' },
            { x: 810, label: 'STAGE 04 · INFERENCE / COMPUTE' },
            { x: 1065, label: 'STAGE 05 · SINK / STORAGE' },
          ].map((col, idx) => (
            <g key={idx}>
              <text
                x={col.x}
                y={22}
                fill="rgba(148, 163, 184, 0.35)"
                fontSize="10"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
                letterSpacing="0.08em"
              >
                {col.label}
              </text>
            </g>
          ))}

          {/* Edges */}
          {edges.map((edge) => {
            const fromNode = nodeMap.get(edge.from);
            const toNode = nodeMap.get(edge.to);
            if (!fromNode || !toNode) return null;

            const em = simulation.edgeMetrics[edge.id] || {
              effectiveRps: 0,
              saturated: false,
            };

            const x1 = fromNode.x + NODE_W;
            const y1 = fromNode.y + NODE_H / 2;
            const x2 = toNode.x;
            const y2 = toNode.y + NODE_H / 2;
            const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
            const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

            const isCritEdge =
              criticalSet.has(edge.from) &&
              criticalSet.has(edge.to) &&
              simulation.criticalPathNodeIds.indexOf(edge.to) ===
                simulation.criticalPathNodeIds.indexOf(edge.from) + 1;

            const strokeColor = em.saturated
              ? '#f43f5e'
              : isCritEdge
              ? '#f59e0b'
              : '#38bdf8';

            const markerId = em.saturated
              ? 'url(#arrow-saturated)'
              : isCritEdge
              ? 'url(#arrow-critical)'
              : 'url(#arrow-nominal)';

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - 8;

            // Speed of packet animation inversely proportional to latency / proportional to RPS
            const animDuration = Math.max(
              0.7,
              Math.min(3.2, 240 / Math.max(15, em.effectiveRps))
            ).toFixed(2);

            return (
              <g key={edge.id}>
                {/* Subtle outer glow path */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeOpacity={isCritEdge || em.saturated ? 0.24 : 0.1}
                  strokeWidth={isCritEdge ? 6 : 4}
                />
                {/* Primary wire */}
                <path
                  id={`edge-path-${edge.id}`}
                  d={pathD}
                  fill="none"
                  stroke={strokeColor}
                  strokeOpacity={0.78}
                  strokeWidth={isCritEdge ? 2.4 : 1.75}
                  strokeDasharray={em.saturated ? '6 4' : undefined}
                  markerEnd={markerId}
                />

                {/* Animated Live Packet Particles */}
                {livePacketsEnabled && em.effectiveRps > 1 && (
                  <>
                    <circle r={isCritEdge ? 4 : 3.2} fill={strokeColor}>
                      <animateMotion
                        dur={`${animDuration}s`}
                        repeatCount="indefinite"
                        path={pathD}
                      />
                    </circle>
                    <circle r={isCritEdge ? 3.5 : 2.6} fill="#f8fafc" fillOpacity="0.85">
                      <animateMotion
                        dur={`${animDuration}s`}
                        begin={`${(Number(animDuration) / 2).toFixed(2)}s`}
                        repeatCount="indefinite"
                        path={pathD}
                      />
                    </circle>
                  </>
                )}

                {/* Edge RPS & Weight Badge */}
                <g transform={`translate(${midX - 34}, ${midY - 10})`}>
                  <rect
                    width="68"
                    height="18"
                    rx="4"
                    fill="#0d111a"
                    stroke={strokeColor}
                    strokeOpacity="0.45"
                    strokeWidth="1"
                  />
                  <text
                    x="34"
                    y="12.5"
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {Math.round(em.effectiveRps)} rps
                  </text>
                </g>
              </g>
            );
          })}

          {/* Service Nodes */}
          {nodes.map((node) => {
            const meta = NODE_CATEGORY_META[node.category] || NODE_CATEGORY_META.worker;
            const m = simulation.nodeMetrics[node.id] || {
              arrivalRps: 0,
              utilization: 0,
              p95Ms: 0,
              errorRate: 0,
              effectiveReplicas: node.replicas,
              status: 'healthy',
            };
            const isSelected = node.id === selectedNodeId;
            const isCrit = criticalSet.has(node.id);
            const isBottleneck = simulation.bottleneckNodeId === node.id;

            const statusColor =
              m.status === 'critical'
                ? '#f43f5e'
                : m.status === 'degraded'
                ? '#f59e0b'
                : '#10b981';

            const utilPct = Math.min(100, Math.round(m.utilization * 100));
            const utilBarWidth = Math.round(((NODE_W - 24) * utilPct) / 100);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onPointerDown={(e) => handlePointerDownNode(e, node)}
                className="cursor-pointer"
              >
                {/* Selection / Bottleneck Halo */}
                {(isSelected || isBottleneck || node.fault) && (
                  <rect
                    x="-4"
                    y="-4"
                    width={NODE_W + 8}
                    height={NODE_H + 8}
                    rx="12"
                    fill="none"
                    stroke={
                      node.fault || m.status === 'critical'
                        ? '#f43f5e'
                        : isSelected
                        ? '#38bdf8'
                        : '#f59e0b'
                    }
                    strokeWidth={isSelected ? '2' : '1.5'}
                    strokeOpacity={isSelected ? '0.9' : '0.55'}
                    strokeDasharray={node.fault ? '5 3' : undefined}
                  />
                )}

                {/* Main Card Body */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx="9"
                  fill="#111623"
                  stroke={isSelected ? '#38bdf8' : meta.border}
                  strokeWidth={isSelected ? '1.8' : '1.2'}
                />

                {/* Top Category Strip */}
                <rect
                  x="1"
                  y="1"
                  width={NODE_W - 2}
                  height="24"
                  rx="8"
                  fill={meta.bg}
                />

                {/* Category Pill & Replica Count */}
                <circle cx="12" cy="13" r="4" fill={meta.color} />
                <text
                  x="21"
                  y="16.5"
                  fill={meta.color}
                  fontSize="9.5"
                  fontWeight="700"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.category.toUpperCase()} · {m.effectiveReplicas}x PODS
                </text>

                {/* Fault Toggle Button on Node Corner */}
                <g
                  transform={`translate(${NODE_W - 24}, 4)`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onToggleNodeFault(node.id);
                  }}
                >
                  <rect
                    width="18"
                    height="16"
                    rx="4"
                    fill={node.fault ? 'rgba(244, 63, 94, 0.3)' : 'rgba(30, 41, 59, 0.8)'}
                    stroke={node.fault ? '#f43f5e' : 'rgba(148, 163, 184, 0.3)'}
                  />
                  <text
                    x="9"
                    y="11.5"
                    textAnchor="middle"
                    fill={node.fault ? '#fda4af' : '#94a3b8'}
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ⚡
                  </text>
                </g>

                {/* Service Title */}
                <text
                  x="12"
                  y="43"
                  fill="#f8fafc"
                  fontSize="12"
                  fontWeight="600"
                >
                  {node.name.length > 23 ? node.name.slice(0, 22) + '…' : node.name}
                </text>

                {/* Primary Metrics Row */}
                <text
                  x="12"
                  y="62"
                  fill="#94a3b8"
                  fontSize="10.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  <tspan fill="#e2e8f0" fontWeight="600">
                    {Math.round(m.arrivalRps)}
                  </tspan>{' '}
                  rps · p95{' '}
                  <tspan
                    fill={m.p95Ms > 220 ? '#fbbf24' : '#38bdf8'}
                    fontWeight="600"
                  >
                    {Math.round(m.p95Ms)}ms
                  </tspan>
                </text>

                {/* Secondary Info: Cache Hit or LLM Tokens or Cost */}
                <text
                  x="12"
                  y="77"
                  fill="#64748b"
                  fontSize="9.5"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.category === 'llm'
                    ? `${(m.tokensPerSec / 1000).toFixed(1)}k tok/s · $${m.totalCostPerHour.toFixed(1)}/h`
                    : node.category === 'cache'
                    ? `Hit ${(m.effectiveCacheHitRate * 100).toFixed(0)}% · Err ${(m.errorRate * 100).toFixed(1)}%`
                    : `Queue ${m.queueOccupancy} · $${m.totalCostPerHour.toFixed(2)}/h`}
                </text>

                {/* Queue Saturation Progress Bar */}
                <rect
                  x="12"
                  y={NODE_H - 14}
                  width={NODE_W - 24}
                  height="5"
                  rx="2.5"
                  fill="#1e293b"
                />
                <rect
                  x="12"
                  y={NODE_H - 14}
                  width={Math.max(4, utilBarWidth)}
                  height="5"
                  rx="2.5"
                  fill={statusColor}
                />

                {/* Critical Path / Bottleneck Tag */}
                {isBottleneck && (
                  <g transform={`translate(${NODE_W - 68}, 50)`}>
                    <rect
                      width="56"
                      height="15"
                      rx="3"
                      fill="rgba(244, 63, 94, 0.2)"
                      stroke="#f43f5e"
                      strokeWidth="0.8"
                    />
                    <text
                      x="28"
                      y="10.5"
                      textAnchor="middle"
                      fill="#fda4af"
                      fontSize="8.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      BOTTLENECK
                    </text>
                  </g>
                )}
                {!isBottleneck && isCrit && (
                  <g transform={`translate(${NODE_W - 58}, 50)`}>
                    <rect
                      width="46"
                      height="15"
                      rx="3"
                      fill="rgba(245, 158, 11, 0.16)"
                      stroke="#f59e0b"
                      strokeWidth="0.8"
                    />
                    <text
                      x="23"
                      y="10.5"
                      textAnchor="middle"
                      fill="#fcd34d"
                      fontSize="8.5"
                      fontWeight="600"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      CRIT PATH
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* Bottom Overlay Bar with Critical Path & Quick Hint */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#0d121d]/90 border border-slate-800/90 backdrop-blur-sm text-[11px]">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-slate-400 font-medium shrink-0">Critical Path:</span>
            <div className="flex items-center gap-1.5 font-mono text-amber-300">
              {(simulation.criticalPathNodeIds || []).map((id, i, arr) => (
                <React.Fragment key={id}>
                  <button
                    onClick={() => onSelectNode(id)}
                    className="hover:underline px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-[10.5px]"
                  >
                    {nodeMap.get(id)?.name || id}
                  </button>
                  {i < arr.length - 1 && <span className="text-slate-600">→</span>}
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="text-slate-400 shrink-0 hidden sm:flex items-center gap-2 font-mono text-[10.5px]">
            <span>Drag nodes to reposition</span>
            <span className="text-slate-600">·</span>
            <span>Click ⚡ on any node to inject local fault</span>
          </div>
        </div>
      </div>
    </div>
  );
}
