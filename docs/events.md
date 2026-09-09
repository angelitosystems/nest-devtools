# Events, Queues & Cron

> **Status: planned for v0.3.** The protocol and dashboard structure already reserve space for this; the collectors land next. This page documents the design.

## Goal

Make background work visible with the same clarity as HTTP: event handlers, queue consumers and scheduled jobs all appear in a unified **Realtime → Events** view.

```
Event                      Timestamp   Duration  Handler            Status
user.created               14:32:10    3ms       SendWelcomeEmail   ✓
order.paid                 14:32:11    41ms      FulfillOrder       ✓
order.paid                 14:32:11    122ms     NotifyWarehouse    ✗ retry 2
notifications.process      14:32:12    310ms     BullMQ worker      ✓
nightly-report             14:32:00    2.1s      CronHandler        ✓
```

## Planned collectors

| Source | Mechanism |
|---|---|
| **EventEmitter2** (Nest's `@EventPattern`) | Wrap `EventEmitter2.prototype.emit` to time handler dispatch |
| **BullMQ** | Worker lifecycle hooks (`completed`, `failed`, `active`) |
| **Queues (generic)** | Adapter interface over enqueue/dequeue events |
| **Cron / `@Cron` / `@Interval` / `@Timeout`** (Schedule module) | Wrap the scheduler registry entries |

## What each event reports

```text
event:      user.created
timestamp:  epoch ms
duration:   3ms (handler execution)
handler:    SendWelcomeEmail.handle
status:     ok | error | retry
requestId:  req_… (when triggered from an HTTP request)
```

Failures attach the error and appear in the [Error Explorer](./errors.md) with their own fingerprint.

## Why correlation matters

A `POST /orders` request that emits `order.paid` and enqueues three jobs produces a single causal chain:

```
HTTP  POST /orders               120ms
  └─ event  order.paid            41ms
       └─ queue  fulfill-order    enqueued
```

All carrying the same `requestId` — so you can follow background work back to the request that started it.

## Enabling / disabling

The `capture` object will gain an `events: boolean` toggle alongside the existing ones. As always, disabling removes every hook — zero overhead.
