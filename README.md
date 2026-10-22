# Pulse Studio

**Interactive Distributed Systems, AI Pipeline & Chaos Engineering Workbench**

Pulse Studio is a standalone engineering workbench for sketching distributed & AI inference topologies, simulating M/M/c and Kingman G/G/c queueing under bursty load, modeling LLM prefill/decode token velocity and unit economics, injecting chaos faults (AZ replica brownouts, prompt context explosions, packet drops, and GC latency spikes), and exporting ready-to-run infrastructure specs (`docker-compose.yml`, Kubernetes `Deployment` + `HorizontalPodAutoscaler`, and Markdown Architecture RFCs).

## Quick Start

```bash
cd /workspace/pulse-studio
npm install
npm run dev
```

Open `http://localhost:4173`.

## Run Tests

```bash
npm test
```

## Core Capabilities

- **Analytical M/M/c & Kingman VUT Queueing Engine**: Calculates arrival rate propagation across DAG fan-out edges, semantic cache short-circuiting, retry amplification, finite-buffer drop rates, and p50/p95/p99 latency curves.
- **LLM Token & Infra Economics**: Models prefill + decode latency per token alongside input/output token pricing and pod infrastructure burn (`$/hr`, `$/1k requests`, `$/month`).
- **Live Chaos Fault Injection**: Inject global or per-node chaos drills (`Network & GC Jitter Spike`, `AZ Replica Brownout`, `Prompt Context Explosion`, `Upstream Packet Drop & Retry Storm`) and watch critical paths and saturation bars respond in real time.
- **One-Click Auto-Remediation & Spec Exporter**: Apply automated SRE capacity fixes and export `docker-compose.yml`, Kubernetes HPA manifests, or an Architecture RFC report.
