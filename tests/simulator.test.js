import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNodeQueueMetrics,
  evaluateTopology,
  generateLoadSweepCurves,
  generateDiagnostics,
} from '../src/engine/simulator.js';
import { TOPOLOGY_PRESETS } from '../src/presets/topologies.js';
import {
  generateDockerComposeSpec,
  generateKubernetesHpaSpec,
  generateArchitectureRFC,
} from '../src/engine/exporters.js';

test('computeNodeQueueMetrics calculates M/M/c queueing latency and token economics accurately', () => {
  const llmNode = TOPOLOGY_PRESETS[0].nodes.find((n) => n.id === 'fast-llm');
  const lowLoad = computeNodeQueueMetrics(llmNode, 40, { mode: 'none', intensity: 1 });
  const highLoad = computeNodeQueueMetrics(llmNode, 215, { mode: 'none', intensity: 1 });

  assert.ok(lowLoad.p95Ms > lowLoad.p50Ms, 'p95 must exceed p50');
  assert.ok(highLoad.queueWaitMs > lowLoad.queueWaitMs, 'High load must increase Kingman queue wait time');
  assert.ok(highLoad.utilization > lowLoad.utilization, 'Utilization scales with arrival RPS');
  assert.ok(highLoad.tokensPerSec > lowLoad.tokensPerSec, 'Tokens/sec scales with effective RPS');
  assert.ok(highLoad.totalCostPerHour > lowLoad.totalCostPerHour, 'Hourly cost increases with token volume');
});

test('evaluateTopology propagates DAG traffic, cache bypass, and chaos faults', () => {
  const preset = TOPOLOGY_PRESETS[0];
  const nominal = evaluateTopology(preset, 340, { mode: 'none', intensity: 1 });
  const chaosReplicaKill = evaluateTopology(preset, 340, {
    mode: 'replica_kill',
    targetNodeId: 'all',
    intensity: 1,
  });

  assert.ok(nominal.e2eP95Ms > 0, 'End-to-end p95 must be positive');
  assert.ok(nominal.criticalPathNodeIds.length >= 3, 'Critical path must traverse DAG layers');
  assert.ok(
    chaosReplicaKill.e2eP95Ms > nominal.e2eP95Ms,
    'Replica kill chaos must degrade end-to-end p95 latency'
  );
  assert.ok(
    chaosReplicaKill.resilienceScore <= nominal.resilienceScore,
    'Chaos fault must reduce or equal resilience score'
  );
});

test('generateLoadSweepCurves and exporters produce valid structured outputs', () => {
  const preset = TOPOLOGY_PRESETS[0];
  const sim = evaluateTopology(preset, 340, { mode: 'latency_spike', targetNodeId: 'all', intensity: 1 });
  const sweep = generateLoadSweepCurves(preset, 340, { mode: 'latency_spike', targetNodeId: 'all', intensity: 1 });
  const diags = generateDiagnostics(preset, sim);

  assert.equal(sweep.length, 10, 'Sweep generates 10 load points');
  assert.ok(sweep[9].nominalP95 >= sweep[0].nominalP95, 'Higher RPS increases or maintains p95 latency');
  assert.ok(diags.length >= 1, 'Diagnostics always returns at least one item');

  const compose = generateDockerComposeSpec(preset, sim);
  const k8s = generateKubernetesHpaSpec(preset, sim);
  const rfc = generateArchitectureRFC(preset, sim, { mode: 'latency_spike' }, diags);

  assert.ok(compose.includes('services:'), 'Docker compose contains services block');
  assert.ok(k8s.includes('HorizontalPodAutoscaler'), 'K8s spec includes HPA manifest');
  assert.ok(rfc.includes('Architecture & Chaos Resilience RFC'), 'RFC markdown includes header');
});
