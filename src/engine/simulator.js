/**
 * Pulse Studio — Analytical Queueing, Token Economics & Chaos Propagation Engine
 *
 * Implements:
 * 1. Kingman's VUT / M/M/c / G/G/c queueing approximation with finite queue drop probability
 * 2. LLM prefill + decode token throughput, KV-cache hit savings, and cost/1k requests
 * 3. DAG topological traffic propagation (fan-out, cache short-circuit, retry amplification)
 * 4. Chaos fault injection (latency spike, packet drop, rate-limit throttle, replica crash, token bloat)
 * 5. Load sweep curve generator (RPS vs p50/p95/p99 latency, saturation, and hourly cost)
 */

export const NODE_CATEGORY_META = {
  ingress: {
    label: 'Ingress & Edge',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.4)',
    defaultPort: 8080,
    image: 'envoyproxy/envoy:v1.31-latest',
  },
  router: {
    label: 'Semantic Router / Guard',
    color: '#a855f7',
    bg: 'rgba(168, 85, 247, 0.12)',
    border: 'rgba(168, 85, 247, 0.4)',
    defaultPort: 8090,
    image: 'ghcr.io/pulse-studio/semantic-router:v2.4',
  },
  cache: {
    label: 'Cache / State Store',
    color: '#10b981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.4)',
    defaultPort: 6379,
    image: 'redis/redis-stack-server:7.4.0-v0',
  },
  vector: {
    label: 'Vector / Retrieval',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.4)',
    defaultPort: 6333,
    image: 'qdrant/qdrant:v1.12.1',
  },
  llm: {
    label: 'LLM Inference Engine',
    color: '#ec4899',
    bg: 'rgba(236, 72, 153, 0.12)',
    border: 'rgba(236, 72, 153, 0.4)',
    defaultPort: 8000,
    image: 'vllm/vllm-openai:v0.6.4',
  },
  queue: {
    label: 'Event Broker / Stream',
    color: '#eab308',
    bg: 'rgba(234, 179, 8, 0.12)',
    border: 'rgba(234, 179, 8, 0.4)',
    defaultPort: 9092,
    image: 'apache/kafka:3.8.0',
  },
  worker: {
    label: 'Compute Microservice',
    color: '#6366f1',
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.4)',
    defaultPort: 8081,
    image: 'ghcr.io/pulse-studio/worker-runtime:v1.9',
  },
  storage: {
    label: 'Transactional DB',
    color: '#14b8a6',
    bg: 'rgba(20, 184, 166, 0.12)',
    border: 'rgba(20, 184, 166, 0.4)',
    defaultPort: 5432,
    image: 'postgres:17-alpine',
  },
};

export const CHAOS_MODES = {
  none: {
    id: 'none',
    name: 'Nominal Operation',
    description: 'No active chaos experiment; standard arrival jitter and service variance.',
    severity: 'healthy',
  },
  latency_spike: {
    id: 'latency_spike',
    name: 'Network & GC Jitter Spike',
    description: 'Injects +180ms base latency and doubles coefficient of variation (tail amplification).',
    severity: 'warning',
  },
  replica_kill: {
    id: 'replica_kill',
    name: 'AZ Replica Brownout (-50% Pods)',
    description: 'Terminates half of active replicas on target node(s), forcing queue saturation.',
    severity: 'critical',
  },
  token_bloat: {
    id: 'token_bloat',
    name: 'Prompt Context Explosion (3x Tokens)',
    description: 'Triples prompt/output token payload on LLM nodes and invalidates semantic caches.',
    severity: 'warning',
  },
  packet_loss: {
    id: 'packet_loss',
    name: 'Upstream 18% Packet Drop & Retry Storm',
    description: 'Injects 18% transport errors, triggering upstream retry amplification.',
    severity: 'critical',
  },
};

/**
 * Computes Erlang-C / Kingman G/G/c queueing metrics for a single service node.
 */
export function computeNodeQueueMetrics(node, arrivalRps, chaosState = {}) {
  const isFaulted =
    Boolean(node.fault) ||
    (chaosState.mode &&
      chaosState.mode !== 'none' &&
      (chaosState.targetNodeId === 'all' || chaosState.targetNodeId === node.id));

  const activeChaosMode = isFaulted
    ? node.faultMode || chaosState.mode || 'latency_spike'
    : 'none';
  const intensity = Number.isFinite(chaosState.intensity) ? chaosState.intensity : 1;

  // Effective replicas
  let effectiveReplicas = Math.max(1, Math.round(node.replicas || 1));
  if (activeChaosMode === 'replica_kill') {
    effectiveReplicas = Math.max(1, Math.floor(effectiveReplicas * Math.max(0.2, 1 - 0.55 * intensity)));
  }

  const concurrencyPerReplica = Math.max(1, node.concurrencyPerReplica || 16);
  const totalSlots = effectiveReplicas * concurrencyPerReplica;

  // Token and service time calculation
  let promptTokens = node.promptTokens || 0;
  let completionTokens = node.completionTokens || 0;
  if (node.category === 'llm' && activeChaosMode === 'token_bloat') {
    promptTokens = Math.round(promptTokens * (1 + 1.8 * intensity));
    completionTokens = Math.round(completionTokens * (1 + 1.4 * intensity));
  }

  // LLM service time includes prefill + decode per token if category === 'llm'
  let baseServiceMs = Math.max(0.5, Number(node.baseLatencyMs) || 10);
  if (node.category === 'llm') {
    const prefillMs = (promptTokens / 1000) * (node.prefillMsPer1k || 18);
    const decodeMs = completionTokens * (node.decodeMsPerToken || 1.15);
    baseServiceMs = baseServiceMs + prefillMs + decodeMs;
  }

  if (activeChaosMode === 'latency_spike') {
    baseServiceMs = baseServiceMs * (1 + 0.85 * intensity) + 140 * intensity;
  }

  // Cache hit rate reduces downstream pass-through (handled in graph propagation)
  let effectiveCacheHitRate = Math.min(0.98, Math.max(0, Number(node.cacheHitRate) || 0));
  if (activeChaosMode === 'token_bloat' && (node.category === 'cache' || node.category === 'router')) {
    effectiveCacheHitRate = effectiveCacheHitRate * Math.max(0.1, 1 - 0.75 * intensity);
  }

  // Service rate per slot (req/sec) = 1000 / baseServiceMs
  // Since LLM batching or async I/O scales differently, each node has maxRpsPerReplica capacity
  const nominalRpsPerReplica =
    Number(node.maxRpsPerReplica) ||
    Math.max(5, Math.round((1000 / baseServiceMs) * Math.min(concurrencyPerReplica, 12)));

  const totalCapacityRps = Math.max(1, effectiveReplicas * nominalRpsPerReplica);
  const rawUtilization = arrivalRps / totalCapacityRps;
  const utilization = Math.min(1.6, Math.max(0, rawUtilization));

  // Coefficient of variation of arrivals (ca) and service (cs)
  const ca = activeChaosMode !== 'none' ? 1.35 * intensity : 1.0;
  const cs = (Number(node.jitterCv) || 0.35) * (activeChaosMode === 'latency_spike' ? 1.9 : 1.0);
  const vutVarianceFactor = (ca * ca + cs * cs) / 2;

  // Kingman's waiting time formula with smooth finite-buffer overload curve
  let queueWaitMs = 0;
  if (rawUtilization > 0.05) {
    const clampedRho = Math.min(0.965, rawUtilization);
    const rhoTerm = Math.pow(clampedRho, Math.sqrt(2 * (effectiveReplicas + 1)) - 1) / (1 - clampedRho);
    queueWaitMs = vutVarianceFactor * (baseServiceMs / Math.max(1, Math.sqrt(effectiveReplicas))) * rhoTerm;

    if (rawUtilization >= 0.965) {
      // Overload regime: queue builds up up to queueDepth limit
      const overloadExcess = rawUtilization - 0.965;
      const maxQueueDelay = ((node.queueDepth || 256) / totalCapacityRps) * 1000;
      queueWaitMs += Math.min(maxQueueDelay * 2.5, overloadExcess * 2400);
    }
  }

  // Drop / Error probability from finite queue overflow + fault injection
  let errorRate = Math.min(1, Math.max(0, Number(node.baseErrorRate) || 0.001));
  if (activeChaosMode === 'packet_loss') {
    errorRate = Math.min(0.95, errorRate + 0.18 * intensity);
  }
  if (rawUtilization > 0.98) {
    const overflowDrop = Math.min(0.85, (rawUtilization - 0.98) / (rawUtilization + 0.15));
    errorRate = Math.min(0.98, 1 - (1 - errorRate) * (1 - overflowDrop));
  }

  const p50Ms = baseServiceMs + queueWaitMs * 0.65;
  const tailMultiplier95 = 1 + 1.645 * cs + (rawUtilization > 0.8 ? (rawUtilization - 0.8) * 2.4 : 0);
  const tailMultiplier99 = 1 + 2.326 * cs * 1.25 + (rawUtilization > 0.75 ? (rawUtilization - 0.75) * 4.2 : 0);

  const p95Ms = p50Ms + baseServiceMs * (tailMultiplier95 - 1) + queueWaitMs * 1.85;
  const p99Ms = p95Ms + baseServiceMs * (tailMultiplier99 - tailMultiplier95) + queueWaitMs * 1.45;

  // Queue depth occupancy estimate (Little's Law L_q = lambda * W_q)
  const queueOccupancy = Math.min(
    node.queueDepth || 512,
    Math.round((arrivalRps * (queueWaitMs / 1000)) * 10) / 10
  );

  // Cost calculation ($/hour)
  // Combines replica infra cost + token/request variable cost
  const infraCostPerHour = effectiveReplicas * (Number(node.costPerReplicaHr) || 0.45);
  let variableCostPer1kReq = Number(node.costPer1kReq) || 0.02;

  if (node.category === 'llm') {
    const inputCostPer1M = Number(node.inputCostPer1M) || 2.5;
    const outputCostPer1M = Number(node.outputCostPer1M) || 10.0;
    const tokenCostPerReq =
      (promptTokens / 1_000_000) * inputCostPer1M +
      (completionTokens / 1_000_000) * outputCostPer1M;
    variableCostPer1kReq = tokenCostPerReq * 1000;
  }

  const effectiveProcessedRps = arrivalRps * (1 - errorRate * 0.5);
  const variableCostPerHour = ((effectiveProcessedRps * 3600) / 1000) * variableCostPer1kReq;
  const totalCostPerHour = infraCostPerHour + variableCostPerHour;

  const status =
    errorRate > 0.08 || rawUtilization > 0.98
      ? 'critical'
      : errorRate > 0.02 || rawUtilization > 0.78 || activeChaosMode !== 'none'
      ? 'degraded'
      : 'healthy';

  return {
    nodeId: node.id,
    arrivalRps: round2(arrivalRps),
    effectiveRps: round2(arrivalRps * (1 - errorRate)),
    capacityRps: round2(totalCapacityRps),
    effectiveReplicas,
    totalSlots,
    utilization: round3(rawUtilization),
    baseServiceMs: round2(baseServiceMs),
    queueWaitMs: round2(queueWaitMs),
    p50Ms: round2(p50Ms),
    p95Ms: round2(p95Ms),
    p99Ms: round2(p99Ms),
    errorRate: round4(errorRate),
    queueOccupancy,
    effectiveCacheHitRate: round3(effectiveCacheHitRate),
    promptTokens,
    completionTokens,
    tokensPerSec:
      node.category === 'llm'
        ? Math.round(arrivalRps * (1 - errorRate) * (promptTokens + completionTokens))
        : 0,
    infraCostPerHour: round2(infraCostPerHour),
    variableCostPerHour: round2(variableCostPerHour),
    totalCostPerHour: round2(totalCostPerHour),
    activeChaosMode,
    status,
  };
}

/**
 * Evaluates an entire DAG topology under a target ingress load and chaos configuration.
 */
export function evaluateTopology(topology, ingressRps, chaosState = {}) {
  const nodes = topology.nodes || [];
  const edges = topology.edges || [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));

  for (const edge of edges) {
    if (nodeMap.has(edge.from) && nodeMap.has(edge.to)) {
      outgoing.get(edge.from).push(edge);
      incoming.get(edge.to).push(edge);
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
    }
  }

  // Topological sort (Kahn's algorithm with cycle fallback)
  const queue = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  const orderedIds = [];
  const visited = new Set();

  while (queue.length > 0) {
    const curr = queue.shift();
    orderedIds.push(curr);
    visited.add(curr);
    for (const edge of outgoing.get(curr) || []) {
      const nextDeg = (inDegree.get(edge.to) || 1) - 1;
      inDegree.set(edge.to, nextDeg);
      if (nextDeg <= 0 && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }
  for (const n of nodes) {
    if (!visited.has(n.id)) orderedIds.push(n.id);
  }

  // Identify root nodes (ingress or nodes with no incoming edges)
  const rootNodes = nodes.filter((n) => (incoming.get(n.id) || []).length === 0);
  const rootCount = Math.max(1, rootNodes.length);

  const nodeArrivalRps = new Map();
  for (const root of rootNodes) {
    nodeArrivalRps.set(root.id, ingressRps / rootCount);
  }

  const nodeMetrics = {};
  const edgeMetrics = {};

  // First pass: propagate arrival RPS and compute per-node queue metrics
  for (const nodeId of orderedIds) {
    const node = nodeMap.get(nodeId);
    const incomingEdges = incoming.get(nodeId) || [];

    let rps = nodeArrivalRps.get(nodeId) || 0;
    if (incomingEdges.length > 0) {
      rps = 0;
      for (const edge of incomingEdges) {
        const em = edgeMetrics[edge.id];
        if (em) {
          rps += em.effectiveRps;
        }
      }
    }

    // Apply retry amplification if downstream or self has retries configured
    const retries = Number(node.retries) || 0;
    const initialMetrics = computeNodeQueueMetrics(node, rps, chaosState);
    const retryAmplification =
      retries > 0 && initialMetrics.errorRate > 0.005
        ? 1 + Math.min(retries, 3) * initialMetrics.errorRate * 0.85
        : 1;

    const finalMetrics =
      retryAmplification > 1.001
        ? computeNodeQueueMetrics(node, rps * retryAmplification, chaosState)
        : initialMetrics;

    finalMetrics.retryAmplification = round3(retryAmplification);
    nodeMetrics[nodeId] = finalMetrics;

    // Propagate to outgoing edges
    // If node is a cache or router with cacheHitRate, cache hits short-circuit downstream DB/LLM calls
    const cacheBypassMultiplier =
      node.category === 'cache' ? 1 - finalMetrics.effectiveCacheHitRate : 1;

    for (const edge of outgoing.get(nodeId) || []) {
      const weight = Number.isFinite(edge.weight) ? Number(edge.weight) : 1.0;
      const edgeRps = finalMetrics.ArrivalOrForwardedRps
        ? finalMetrics.ArrivalOrForwardedRps * weight
        : finalMetrics.arrivalRps * (1 - finalMetrics.errorRate * 0.65) * cacheBypassMultiplier * weight;

      const networkLatencyMs = Number(edge.networkLatencyMs) || 1.5;
      edgeMetrics[edge.id] = {
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        weight,
        effectiveRps: round2(edgeRps),
        networkLatencyMs,
        saturated: finalMetrics.utilization > 0.9 || finalMetrics.errorRate > 0.05,
      };
    }
  }

  // Second pass: Critical path latency (longest weighted path from root to sink)
  const pathP50 = new Map();
  const pathP95 = new Map();
  const pathP99 = new Map();
  const pathParent = new Map();

  for (const nodeId of orderedIds) {
    const m = nodeMetrics[nodeId];
    if (!m) continue;
    const inc = incoming.get(nodeId) || [];
    if (inc.length === 0) {
      pathP50.set(nodeId, m.p50Ms);
      pathP95.set(nodeId, m.p95Ms);
      pathP99.set(nodeId, m.p99Ms);
      pathParent.set(nodeId, null);
    } else {
      let max95 = -1;
      let bestFrom = null;
      let bestNet = 0;
      for (const e of inc) {
        const prev95 = (pathP95.get(e.from) || 0) + (Number(e.networkLatencyMs) || 1.5) * (e.weight || 1);
        if (prev95 > max95) {
          max95 = prev95;
          bestFrom = e.from;
          bestNet = Number(e.networkLatencyMs) || 1.5;
        }
      }
      // If node is behind a cache hit, blend critical path latency by (1 - hitRate) of upstream cache
      const parentNode = bestFrom ? nodeMap.get(bestFrom) : null;
      const parentMetrics = bestFrom ? nodeMetrics[bestFrom] : null;
      const hitDiscount =
        parentNode && parentNode.category === 'cache' && parentMetrics
          ? 1 - parentMetrics.effectiveCacheHitRate * 0.85
          : 1;

      pathP50.set(nodeId, (pathP50.get(bestFrom) || 0) + bestNet + m.p50Ms * hitDiscount);
      pathP95.set(nodeId, (pathP95.get(bestFrom) || 0) + bestNet + m.p95Ms * hitDiscount);
      pathP99.set(nodeId, (pathP99.get(bestFrom) || 0) + bestNet + m.p99Ms * hitDiscount);
      pathParent.set(nodeId, bestFrom);
    }
  }

  // Find critical path sink
  let criticalSinkId = orderedIds[orderedIds.length - 1] || null;
  let maxEndToEndP95 = 0;
  for (const [id, val] of pathP95.entries()) {
    if (val >= maxEndToEndP95) {
      maxEndToEndP95 = val;
      criticalSinkId = id;
    }
  }

  const criticalPathNodeIds = [];
  let cursor = criticalSinkId;
  const seenCursor = new Set();
  while (cursor && !seenCursor.has(cursor)) {
    seenCursor.add(cursor);
    criticalPathNodeIds.unshift(cursor);
    cursor = pathParent.get(cursor);
  }

  // Aggregate system-level KPIs
  let totalCostPerHour = 0;
  let totalTokensPerSec = 0;
  let maxUtilization = 0;
  let bottleneckNodeId = null;
  let systemSuccessProb = 1.0;

  for (const node of nodes) {
    const m = nodeMetrics[node.id];
    if (!m) continue;
    totalCostPerHour += m.totalCostPerHour;
    totalTokensPerSec += m.tokensPerSec;
    if (m.utilization > maxUtilization) {
      maxUtilization = m.utilization;
      bottleneckNodeId = node.id;
    }
    // Weight node failure by its share of ingress traffic
    const trafficShare = Math.min(1, m.arrivalRps / Math.max(1, ingressRps));
    const effectiveNodeAvail = 1 - m.errorRate * Math.max(0.25, trafficShare);
    systemSuccessProb *= Math.max(0.01, effectiveNodeAvail);
  }

  const e2eP50Ms = round2(pathP50.get(criticalSinkId) || 0);
  const e2eP95Ms = round2(pathP95.get(criticalSinkId) || 0);
  const e2eP99Ms = round2(pathP99.get(criticalSinkId) || 0);
  const availabilityPct = round3(systemSuccessProb * 100);
  const systemErrorRatePct = round2((1 - systemSuccessProb) * 100);
  const effectiveThroughputRps = round2(ingressRps * systemSuccessProb);
  const costPer1kRequests =
    ingressRps > 0 ? round3((totalCostPerHour / (ingressRps * 3.6))) : 0;

  // Resilience score (0 - 100)
  const sloLatencyTargetMs = topology.sloTargetMs || 450;
  const latencyPenalty = Math.max(0, ((e2eP95Ms - sloLatencyTargetMs) / sloLatencyTargetMs) * 35);
  const saturationPenalty = maxUtilization > 0.8 ? (maxUtilization - 0.8) * 90 : 0;
  const errorPenalty = systemErrorRatePct * 3.2;
  const resilienceScore = Math.max(
    0,
    Math.min(100, Math.round(100 - latencyPenalty - saturationPenalty - errorPenalty))
  );

  return {
    ingressRps,
    effectiveThroughputRps,
    e2eP50Ms,
    e2eP95Ms,
    e2eP99Ms,
    availabilityPct,
    systemErrorRatePct,
    totalCostPerHour: round2(totalCostPerHour),
    monthlyProjectedCost: Math.round(totalCostPerHour * 730),
    costPer1kRequests,
    totalTokensPerSec,
    maxUtilization: round3(maxUtilization),
    bottleneckNodeId,
    bottleneckNodeName: bottleneckNodeId ? nodeMap.get(bottleneckNodeId)?.name : 'None',
    criticalPathNodeIds,
    resilienceScore,
    sloLatencyTargetMs,
    sloMet: e2eP95Ms <= sloLatencyTargetMs && availabilityPct >= 99.0,
    nodeMetrics,
    edgeMetrics,
  };
}

/**
 * Generates a 10-point load sweep curve from 15% to 160% of current or nominal RPS
 * for plotting latency vs throughput and comparing nominal vs chaos curves.
 */
export function generateLoadSweepCurves(topology, baseIngressRps, chaosState = {}) {
  const centerRps = Math.max(50, baseIngressRps);
  const multipliers = [0.2, 0.4, 0.6, 0.8, 1.0, 1.15, 1.3, 1.45, 1.6, 1.8];

  return multipliers.map((mult) => {
    const rps = Math.round(centerRps * mult);
    const nominalEval = evaluateTopology(topology, rps, { mode: 'none', intensity: 1 });
    const chaosEval = evaluateTopology(topology, rps, chaosState);

    return {
      rps,
      label: `${rps}`,
      nominalP50: nominalEval.e2eP50Ms,
      nominalP95: nominalEval.e2eP95Ms,
      nominalP99: nominalEval.e2eP99Ms,
      chaosP95: chaosEval.e2eP95Ms,
      chaosP99: chaosEval.e2eP99Ms,
      nominalCostHr: nominalEval.totalCostPerHour,
      chaosCostHr: chaosEval.totalCostPerHour,
      nominalErrorPct: nominalEval.systemErrorRatePct,
      chaosErrorPct: chaosEval.systemErrorRatePct,
      maxUtilPct: Math.round(chaosEval.maxUtilization * 100),
    };
  });
}

/**
 * Generates actionable SRE & AI Systems Architecture recommendations from live simulation metrics.
 */
export function generateDiagnostics(topology, simulation) {
  const findings = [];
  const nodeMap = new Map((topology.nodes || []).map((n) => [n.id, n]));

  for (const [nodeId, m] of Object.entries(simulation.nodeMetrics)) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;

    if (m.utilization >= 0.92) {
      const neededReplicas = Math.ceil(
        (m.arrivalRps / (m.capacityRps / m.effectiveReplicas)) * 1.25
      );
      findings.push({
        id: `sat-${nodeId}`,
        severity: m.utilization >= 1.0 ? 'critical' : 'warning',
        nodeId,
        nodeName: node.name,
        title: `Queue Saturation on ${node.name} (${Math.round(m.utilization * 100)}% util)`,
        detail: `Arrival rate (${m.arrivalRps} RPS) approaches or exceeds capacity (${m.capacityRps} RPS), adding ${m.queueWaitMs}ms of Kingman queueing delay.`,
        recommendation: `Scale replicas from ${m.effectiveReplicas} → ${Math.max(m.effectiveReplicas + 1, neededReplicas)} or enable upstream caching.`,
        fixAction: {
          type: 'scale_replicas',
          nodeId,
          replicas: Math.max(m.effectiveReplicas + 1, neededReplicas),
        },
      });
    }

    if (node.category === 'llm' && m.totalCostPerHour > 25) {
      findings.push({
        id: `cost-${nodeId}`,
        severity: 'info',
        nodeId,
        nodeName: node.name,
        title: `High Token Burn on ${node.name} ($${m.totalCostPerHour.toFixed(2)}/hr)`,
        detail: `Processing ${m.tokensPerSec.toLocaleString()} tok/s (${m.promptTokens} in / ${m.completionTokens} out per call).`,
        recommendation: `Increase semantic router/cache hit rate or trim prompt context window by 30%.`,
        fixAction: {
          type: 'trim_tokens',
          nodeId,
          promptTokens: Math.max(256, Math.round(node.promptTokens * 0.7)),
        },
      });
    }

    if (m.retryAmplification > 1.05) {
      findings.push({
        id: `retry-${nodeId}`,
        severity: 'warning',
        nodeId,
        nodeName: node.name,
        title: `Retry Amplification (${((m.retryAmplification - 1) * 100).toFixed(1)}% extra load)`,
        detail: `Configured retries (${node.retries}) under ${(m.errorRate * 100).toFixed(1)}% error rate amplify queue pressure.`,
        recommendation: `Engage adaptive circuit breaker or cap retries to 1 with jittered backoff.`,
        fixAction: {
          type: 'cap_retries',
          nodeId,
          retries: 1,
        },
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      id: 'healthy-all',
      severity: 'healthy',
      nodeId: null,
      nodeName: 'System Topology',
      title: 'All Services Operating Within SLO Envelope',
      detail: `End-to-end p95 (${simulation.e2eP95Ms}ms) is within the ${simulation.sloLatencyTargetMs}ms target at ${simulation.availabilityPct}% availability.`,
      recommendation: 'Try injecting a Chaos Fault (AZ Brownout or Token Bloat) to verify resilience headroom.',
      fixAction: null,
    });
  }

  return findings;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}
