# WebSockets

> **Status: shipping in v0.3.** The capture toggle (`capture.websockets`) and protocol events (`websocket.connected`, `websocket.message`) already exist; the gateway collector lands next. This page documents the design.

## Goal

NestJS apps using `@WebSocketGateway()` get a realtime view of their socket layer: which gateways exist, how many clients are connected, which events flow and at what latency.

## Planned view

```
ChatGateway  (namespace /)
Connections: 43

Events:
message
 ├── received: 132
 └── sent: 129

typing
 ├── received: 421
 └── sent: 420
```

## What each gateway reports

| Signal | Event | Description |
|---|---|---|
| Gateway discovered | `websocket.connected` | Namespace, current connection count |
| Event received | `websocket.message` | Event name, direction `received`, payload size |
| Event emitted | `websocket.message` | Event name, direction `sent`, payload size, duration |
| Handler failure | `websocket.message` | With `error` field attached |

All message events carry the `requestId` of the HTTP request that triggered the emit, when applicable — tying socket activity back to the [request timeline](./http-monitoring.md).

## Detection

The SDK introspects the Nest container for gateway classes (subtype `gateway` / classes annotated with `@WebSocketGateway()`), then wraps handler registration — the same non-invasive approach used for HTTP.

## Privacy

- Message **payloads are never transmitted** — only their byte size.
- Event names, counts and timings are shared; contents stay in your process.
- Handshake headers are not captured.

## Enabling / disabling

```ts
NestDevTools.init(app, {
  capture: { websockets: false },   // opt out entirely
});
```

## Roadmap

Socket-level latency histograms and per-room analytics are planned after v0.3 — see the [Plugin API](./plugin-api.md) for building custom collectors in the meantime.
