import React, { useEffect, useMemo, useState } from 'react';
import {
  CHAOS_MODES,
  evaluateTopology,
  generateLoadSweepCurves,
  generateDiagnostics,
} from './engine/simulator.js';
import { TOPOLOGY_PRESETS } from './presets/topologies.js';
import TopologyCanvas from './components/TopologyCanvas.jsx';
import TelemetryWorkbench from './components/TelemetryWorkbench.jsx';
import NodeInspector from './components/NodeInspector.jsx';
import {
  Activity,
  Flame,
  Gauge,
  Layers,
  Play,
  Pause,
  RotateCcw,
  Download,
  Upload,
  ShieldAlert,
  Sparkles,
  DollarSign,
  Clock,
} from 'lucide-react';

const STORAGE_KEY = 'pulse_studio_state_v1';

function clonePreset(preset) {
  return JSON.parse(JSON.stringify(preset));
}

export default function App() {
  const [presetId, setPresetId] = useState(TOPOLOGY_PRESETS[0].id);
  const [topology, setTopology] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.topology?.nodes?.length) return parsed.topology;
      }
    } catch {
      // ignore storage errors
    }
    return clonePreset(TOPOLOGY_PRESETS[0]);
  });

  const [ingressRps, setIngressRps] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Number.isFinite(parsed?.ingressRps)) return parsed.ingressRps;
      }
    } catch {
      // ignore
    }
    return TOPOLOGY_PRESETS[0].defaultIngressRps;
  });

  const [chaosState, setChaosState] = useState({
    mode: 'none',
    targetNodeId: 'all',
    intensity: 1.0,
  });

  const [selectedNodeId, setSelectedNodeId] = useState(
    () => topology.nodes?.[0]?.id || null
  );
  const [livePacketsEnabled, setLivePacketsEnabled] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ topology, ingressRps, presetId })
      );
    } catch {
      // ignore quota errors
    }
  }, [topology, ingressRps, presetId]);

  const simulation = useMemo(
    () => evaluateTopology(topology, ingressRps, chaosState),
    [topology, ingressRps, chaosState]
  );

  const sweepData = useMemo(
    () => generateLoadSweepCurves(topology, ingressRps, chaosState),
    [topology, ingressRps, chaosState]
  );

  const diagnostics = useMemo(
    () => generateDiagnostics(topology, simulation),
    [topology, simulation]
  );

  const selectedNode = useMemo(
    () => (topology.nodes || []).find((n) => n.id === selectedNodeId) || topology.nodes?.[0],
    [topology.nodes, selectedNodeId]
  );

  const handleSelectPreset = (nextPresetId) => {
    const found = TOPOLOGY_PRESETS.find((p) => p.id === nextPresetId);
    if (!found) return;
    const cloned = clonePreset(found);
    setPresetId(found.id);
    setTopology(cloned);
    setIngressRps(found.defaultIngressRps);
    setChaosState({ mode: 'none', targetNodeId: 'all', intensity: 1.0 });
    setSelectedNodeId(cloned.nodes[0]?.id || null);
  };

  const handleResetTopology = () => {
    handleSelectPreset(presetId);
  };

  const handleMoveNode = (nodeId, x, y) => {
    setTopology((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    }));
  };

  const handleUpdateNode = (nodeId, patch) => {
    setTopology((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    }));
  };

  const handleToggleNodeFault = (nodeId) => {
    setTopology((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, fault: !n.fault } : n
      ),
    }));
  };

  const handleDeleteNode = (nodeId) => {
    setTopology((prev) => {
      const remaining = prev.nodes.filter((n) => n.id !== nodeId);
      const remainingEdges = prev.edges.filter(
        (e) => e.from !== nodeId && e.to !== nodeId
      );
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(remaining[0]?.id || null);
      }
      return {
        ...prev,
        nodes: remaining,
        edges: remainingEdges,
      };
    });
  };

  const handleAddNode = () => {
    const idx = (topology.nodes?.length || 0) + 1;
    const newId = `svc-node-${idx}`;
    const newNode = {
      id: newId,
      name: `Worker Pool ${idx}`,
      category: 'worker',
      x: 540,
      y: 210,
      replicas: 3,
      concurrencyPerReplica: 32,
      maxRpsPerReplica: 120,
      baseLatencyMs: 18,
      jitterCv: 0.3,
      baseErrorRate: 0.001,
      retries: 1,
      queueDepth: 256,
      costPerReplicaHr: 0.6,
      costPer1kReq: 0.01,
    };

    setTopology((prev) => {
      const sourceId = selectedNodeId || prev.nodes[0]?.id;
      const nextEdges = sourceId
        ? [
            ...prev.edges,
            {
              id: `e-${Date.now()}`,
              from: sourceId,
              to: newId,
              weight: 0.5,
              networkLatencyMs: 1.5,
            },
          ]
        : prev.edges;
      return {
        ...prev,
        nodes: [...prev.nodes, newNode],
        edges: nextEdges,
      };
    });
    setSelectedNodeId(newId);
  };

  const handleConnectNodes = (fromId, toId) => {
    setTopology((prev) => {
      const exists = prev.edges.some((e) => e.from === fromId && e.to === toId);
      if (exists) return prev;
      return {
        ...prev,
        edges: [
          ...prev.edges,
          {
            id: `e-${Date.now()}`,
            from: fromId,
            to: toId,
            weight: 0.6,
            networkLatencyMs: 1.5,
          },
        ],
      };
    });
  };

  const handleUpdateEdgeWeight = (edgeId, weight) => {
    setTopology((prev) => ({
      ...prev,
      edges: prev.edges.map((e) => (e.id === edgeId ? { ...e, weight } : e)),
    }));
  };

  const handleDeleteEdge = (edgeId) => {
    setTopology((prev) => ({
      ...prev,
      edges: prev.edges.filter((e) => e.id !== edgeId),
    }));
  };

  const handleApplyFix = (fixAction) => {
    if (!fixAction) return;
    if (fixAction.type === 'scale_replicas') {
      handleUpdateNode(fixAction.nodeId, { replicas: fixAction.replicas });
      setSelectedNodeId(fixAction.nodeId);
    } else if (fixAction.type === 'trim_tokens') {
      handleUpdateNode(fixAction.nodeId, { promptTokens: fixAction.promptTokens });
      setSelectedNodeId(fixAction.nodeId);
    } else if (fixAction.type === 'cap_retries') {
      handleUpdateNode(fixAction.nodeId, { retries: fixAction.retries });
      setSelectedNodeId(fixAction.nodeId);
    }
  };

  const handleExportTopologyJson = () => {
    const payload = JSON.stringify(
      { topology, ingressRps, chaosState, exportedAt: new Date().toISOString() },
      null,
      2
    );
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topology.id || 'pulse-topology'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTopologyJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(String(evt.target?.result || '{}'));
        if (parsed?.topology?.nodes?.length) {
          setTopology(parsed.topology);
          if (Number.isFinite(parsed.ingressRps)) setIngressRps(parsed.ingressRps);
          setSelectedNodeId(parsed.topology.nodes[0]?.id || null);
        }
      } catch {
        // ignore invalid json
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#07090f] text-slate-100 overflow-hidden">
      {/* Top Command Bar */}
      <header className="px-4 py-2.5 bg-[#0c101b] border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Brand & Preset Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white">
                  PULSE STUDIO
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  v2.4 SIMULATOR
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 hidden sm:block">
                Distributed Queueing, LLM Token Economics & Chaos Workbench
              </p>
            </div>
          </div>

          <div className="h-5 w-[1px] bg-slate-800 hidden md:block" />

          {/* Preset Selector */}
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={presetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#07090f] border border-slate-700/80 text-xs font-medium text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              {TOPOLOGY_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  Blueprint: {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Load & Chaos Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Ingress RPS Slider */}
          <div className="flex items-center gap-2.5 px-3 py-1 rounded-lg bg-[#080b12] border border-slate-800">
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            <div className="text-xs">
              <span className="text-slate-400 mr-1.5">Ingress Load:</span>
              <span className="font-mono font-bold text-cyan-300">
                {ingressRps} RPS
              </span>
            </div>
            <input
              type="range"
              min="40"
              max="1200"
              step="10"
              value={ingressRps}
              onChange={(e) => setIngressRps(Number(e.target.value))}
              className="w-28 accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Global Chaos Profile Selector */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[#080b12] border border-slate-800">
            <Flame
              className={`w-3.5 h-3.5 ${
                chaosState.mode !== 'none'
                  ? 'text-rose-400 animate-bounce'
                  : 'text-slate-400'
              }`}
            />
            <span className="text-xs text-slate-400">Chaos Drill:</span>
            <select
              value={chaosState.mode}
              onChange={(e) =>
                setChaosState((prev) => ({ ...prev, mode: e.target.value }))
              }
              className={`px-2 py-0.5 rounded text-xs font-medium border focus:outline-none ${
                chaosState.mode !== 'none'
                  ? 'bg-rose-500/20 text-rose-200 border-rose-500/50'
                  : 'bg-[#0c101b] text-slate-200 border-slate-700'
              }`}
            >
              {Object.values(CHAOS_MODES).map((cm) => (
                <option key={cm.id} value={cm.id}>
                  {cm.name}
                </option>
              ))}
            </select>
          </div>

          {/* Packet Animation Toggle & Reset/Export */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setLivePacketsEnabled((v) => !v)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                livePacketsEnabled
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Toggle live request packet flow animation"
            >
              {livePacketsEnabled ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {livePacketsEnabled ? 'Live Flow' : 'Paused'}
            </button>

            <button
              onClick={handleResetTopology}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Reset blueprint to default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleExportTopologyJson}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title="Export topology JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <label
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
              title="Import topology JSON"
            >
              <Upload className="w-3.5 h-3.5" />
              <input
                type="file"
                accept=".json"
                onChange={handleImportTopologyJson}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </header>

      {/* Top KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 px-4 py-2 bg-[#090c14] border-b border-slate-800/80 shrink-0">
        <div className="px-3 py-1.5 rounded-lg bg-[#0e1320] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] text-slate-400">End-to-End p95 / p99</div>
            <div className="text-sm font-mono font-bold text-cyan-300">
              {simulation.e2eP95Ms}ms{' '}
              <span className="text-xs font-normal text-slate-400">
                / {simulation.e2eP99Ms}ms
              </span>
            </div>
          </div>
          <Clock className="w-4 h-4 text-cyan-400/70" />
        </div>

        <div className="px-3 py-1.5 rounded-lg bg-[#0e1320] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] text-slate-400">Effective Goodput</div>
            <div className="text-sm font-mono font-bold text-emerald-300">
              {simulation.effectiveThroughputRps} RPS{' '}
              <span className="text-xs font-normal text-slate-400">
                ({simulation.availabilityPct}%)
              </span>
            </div>
          </div>
          <Activity className="w-4 h-4 text-emerald-400/70" />
        </div>

        <div className="px-3 py-1.5 rounded-lg bg-[#0e1320] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] text-slate-400">Resilience & SLO Score</div>
            <div
              className={`text-sm font-mono font-bold ${
                simulation.resilienceScore >= 80
                  ? 'text-emerald-300'
                  : simulation.resilienceScore >= 55
                  ? 'text-amber-300'
                  : 'text-rose-400'
              }`}
            >
              {simulation.resilienceScore} / 100{' '}
              <span className="text-[10.5px] font-sans font-medium uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {simulation.sloMet ? 'SLO Met' : 'Breach'}
              </span>
            </div>
          </div>
          <ShieldAlert className="w-4 h-4 text-amber-400/70" />
        </div>

        <div className="px-3 py-1.5 rounded-lg bg-[#0e1320] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] text-slate-400">LLM Token Velocity</div>
            <div className="text-sm font-mono font-bold text-pink-300">
              {(simulation.totalTokensPerSec / 1000).toFixed(1)}k tok/s
            </div>
          </div>
          <Sparkles className="w-4 h-4 text-pink-400/70" />
        </div>

        <div className="px-3 py-1.5 rounded-lg bg-[#0e1320] border border-slate-800/80 flex items-center justify-between">
          <div>
            <div className="text-[10.5px] text-slate-400">Infra + Token Burn</div>
            <div className="text-sm font-mono font-bold text-amber-300">
              ${simulation.totalCostPerHour.toFixed(2)}/hr{' '}
              <span className="text-xs font-normal text-slate-400">
                (${simulation.costPer1kRequests}/1k)
              </span>
            </div>
          </div>
          <DollarSign className="w-4 h-4 text-amber-400/70" />
        </div>

        <div className="px-3 py-1.5 rounded-lg bg-[#0e1320] border border-slate-800/80 flex items-center justify-between">
          <div className="truncate">
            <div className="text-[10.5px] text-slate-400">Bottleneck Service</div>
            <div className="text-xs font-mono font-bold text-rose-300 truncate">
              {simulation.bottleneckNodeName} ({Math.round(simulation.maxUtilization * 100)}%)
            </div>
          </div>
        </div>
      </div>

      {/* Main Split Workbench */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center Canvas + Bottom Telemetry Workbench */}
        <main className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto">
          <TopologyCanvas
            topology={topology}
            simulation={simulation}
            selectedNodeId={selectedNode?.id}
            onSelectNode={setSelectedNodeId}
            onMoveNode={handleMoveNode}
            onToggleNodeFault={handleToggleNodeFault}
            onAddNode={handleAddNode}
            onConnectNodes={handleConnectNodes}
            livePacketsEnabled={livePacketsEnabled}
          />

          <TelemetryWorkbench
            topology={topology}
            simulation={simulation}
            sweepData={sweepData}
            chaosState={chaosState}
            diagnostics={diagnostics}
            onApplyFix={handleApplyFix}
            onSelectNode={setSelectedNodeId}
          />
        </main>

        {/* Right Node Inspector */}
        <NodeInspector
          node={selectedNode}
          nodeMetrics={selectedNode ? simulation.nodeMetrics[selectedNode.id] : null}
          edges={topology.edges}
          allNodes={topology.nodes}
          onUpdateNode={handleUpdateNode}
          onDeleteNode={handleDeleteNode}
          onUpdateEdgeWeight={handleUpdateEdgeWeight}
          onDeleteEdge={handleDeleteEdge}
        />
      </div>
    </div>
  );
}
