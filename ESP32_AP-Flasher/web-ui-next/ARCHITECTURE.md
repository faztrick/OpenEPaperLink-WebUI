# Architecture Overview (Next.js 15 Alignment)

This document maps the current `web-ui-next` implementation to modern full‑stack architectural practices for Next.js 15+.

## High-Level Goals

1. Single runtime delivering UI + feature APIs (agent, logging, AI, transport helpers).
2. Minimal client bundle: push stateful / privileged work to the server layer.
3. Explicit separation of concerns: UI / Hooks / Domain Services / Infra Adapters / API Routes.
4. Optional capabilities (AI / Agent) activated by env flags without build coupling.
5. Progressive hardening: validation, tracing control, cleanup for Windows build quirks.

## Layering Model

| Layer | Responsibility | Current Directories / Files | Notes |
|-------|----------------|------------------------------|-------|
| UI Components | Presentational + interaction (client) | `components/`, selective `pages/` | Add `"use client"` only when browser APIs needed. |
| Hooks (State / Composition) | Local & persisted state (localStorage), derived logic | `hooks/` | Keep transport selection + saved devices here, not in components. |
| Domain Services | Pure(ish) logic: AI chat, logging manager, agent runner | `lib/server/*`, `lib/deviceOverrides*` | Server-only where secrets / side-effects. |
| Infra Adapters | External boundaries (serial sidecar, OpenAI dynamic import) | `lib/server/aiTools.ts`, sidecar code | Avoid leaking adapter details into components. |
| API Routes (Controllers) | Shape HTTP -> domain/service calls | `pages/api/*` | Thin: parse input, invoke, serialize output. |
| Persistence (Browser) | Durable local config | `lib/legacy/savedDevices.ts` | Consider rename to `lib/persistence/browser/`. |
| Feature Flags / Env | Runtime capability matrix | `.env`, README, dynamic checks | Add typed validator later (e.g. t3-env). |

## Server vs Client Components

Currently using **Pages Router**. Migration plan (optional): gradually introduce `/app` for heavy server rendering paths (e.g., logs stream viewer) while keeping thin client hydration for interaction panels.

Guidelines adopted:

- Client: only components touching `localStorage`, `window`, user events.
- Server: APIs + future potential Server Actions (if moving to App Router) for device scans, log snapshot streaming bootstrap.

## Optional Dependency Strategy (AI)

`openai` is **not installed by default**. The module is imported at runtime via an opaque dynamic import inside `aiTools.ts`. This prevents Next.js from resolving the package at build time and preserves a clean build when AI features are disabled.

Fallback order for AI:

1. Env flag disabled -> return disabled response.
2. No key -> mock echo response.
3. Dynamic import failure -> mock (annotated `[mock-no-openai]`).
4. Live OpenAI call -> structured success or logged failure.

## Device & Transport Handling

Saved devices + active override unify around `(host, port, method, com)`.
Transport selection logic (HTTP / WS / Serial) is consolidated in hooks and reused by edit panels. Future optimization: introduce a `TransportResolver` service that exposes a discriminated union for strongly typed operation calls.

## Logging Subsystem

- Ring buffer in memory (scoped by category) -> API tail & SSE stream.
- Console mirror endpoint for agent bridging.
- Potential enhancements: pluggable persistence provider (file / external time-series) behind an interface.

## Agent Subsystem

- Token-gated, action execution & provider switch.
- IPC / sidecar boundaries intentionally isolated from UI.
- Future: Move action definitions to `lib/domain/agent/actions/` and register via a manifest.

## Build Stability (Windows)

Issue: EPERM on `.next/trace`. Mitigation added in `scripts/auto_stop_next.js`:

- Stop PM2 dev process.
- Attempt removal of stale trace file.
- Optional full clean when `FORCE_FULL_NEXT_CLEAN=1`.

## Planned Enhancements

| Area | Short Term | Medium Term | Long Term |
|------|------------|-------------|-----------|
| Env Validation | Introduce `@t3-oss/env-nextjs` for typed vars | Segment client vs server env | Inline docs generation per flag |
| Transport | Extract resolver service | Add retry / health metrics | Pluggable strategies (BLE, UDP) |
| Logging | Add size limit config + category filters | Export to file (download) | Structured log indices (external store) |
| AI | Tool call scaffolding + streaming | Multi-provider abstraction | Pluggable tool registry & vector context |
| Agent | Action manifest + validation | Sandbox isolation (vm2 / WASM) | Remote agent cluster orchestration |
| State Persistence | Rename legacy path & add version bump strategy | Migrate to namespaced keys | Encryption / backup sync |
| App Router | Hybrid incremental adoption | Full migration | Remove Pages duplication |

## Architectural Principles Summary

1. Keep API routes thin; push logic to domain services.
2. Make optional features zero-cost when disabled (no bundle impact, fast noop).
3. Favor late binding for unstable or secret-bound integrations.
4. Encapsulate persistence boundaries (localStorage) away from pure components.
5. Progressive enhancement: Start with Pages Router; adopt Server Actions only where ergonomic / perf wins exist.
6. Build hygiene scripts defend against platform-specific flakiness.

---
Last updated: (auto-generated) <!-- UPDATE DATE MANUALLY WHEN EDITING -->
