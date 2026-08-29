# Blink Chess

Blink Chess is a two-player chess game whose code, state, and running-development-server recipe teleport between two laptops after every move. When you move, the complete workspace is snapshotted and handed to your opponent by [Abra](../abra); once their daemon durably acknowledges it, your server stops and your working copy is parked. The other laptop materializes the workspace, runs Abra's observed recipe, flips the board, and starts its clock. Blink Chess contains no socket, transport, replication, reconnection, or conflict-resolution implementation: its networking layer is a thin wrapper around the public `abra` CLI.

## Move → teleport cycle

```text
 Laptop A (your turn)                         Laptop B
 ┌────────────────────┐                      ┌────────────────────┐
 │ POST /api/move     │                      │ abra watch --json  │
 │ validate + game.json│                     │                    │
 └─────────┬──────────┘                      └─────────▲──────────┘
           │ snapshot                                  │ capsule event
           ▼                                           │
   abra snapshot ──► abra send --capsule ──────────────┘
                          │
                          ▼
                    outbox: acked
                          │
                 stop server + park                    
                                                    abra accept
                                                         │
                                               read recipes.json
                                                         │
                                                  npm run dev
```

The sender's parked folder is safe theater: Abra's content-addressed store retains the durable snapshot. No game state is discarded.

## Two laptops

Requirements: Node 22+, npm, and an `abra` binary. Set `ABRA_BIN=/path/to/abra` if it is not on `PATH`; the development fallback is `/Users/vividh/Desktop/abra/target/debug/abra`.

On laptop A:

```bash
./blink.mjs host --name alice
```

Copy the printed `abra-pair/1/...` invite. On laptop B:

```bash
./blink.mjs join 'abra-pair/1/...' --name bob
```

The default Abra transport is `iroh`. For a local TCP-only run, add `--transport tcp`. Player data lives under `~/.blink/<name>` unless `--root` is supplied. The board uses port 5173 by default; override it with `--port`.

## One-machine proof

Build Abra once, then run:

```bash
cd /Users/vividh/Desktop/abra && cargo build --workspace
cd /Users/vividh/Desktop/blink-chess && npm run demo
```

The test starts two real Abra daemons with isolated roots, pairs them, plays `e2e4 e7e5 Nf3 Nc6` through HTTP, and executes the real snapshot → send → ack → accept → recipe path after every ply. It asserts the active/parked side alternates and the landed `game.json` remains legal and identical in meaning.

## How this uses Abra

All calls live in `abra.mjs`:

- `abra --root R daemon --yes` starts the per-player daemon.
- `status`, `pair ticket`, `pair add`, and `peers` provide identity and mutual trust.
- `init <game>` creates the workspace capsule; `lease take <capsule>` grants the local turn owner authorship.
- `snapshot <game> -m "move N: e2e4"` records the complete workspace and state.
- `send <peer> --capsule <capsule>` sends the full capsule head.
- `outbox` is checked until the matching entry is `acked`, meaning the receiver durably committed it.
- `watch --json` is the long-lived event stream that wakes the waiting player; there is no app polling loop for incoming moves.
- `log --capsule <id>` resolves the received full-capsule head. Full snapshots intentionally do not appear in `inbox`.
- `accept <snapshot> --to <empty-dir>` materializes the app, after which `.abra/recipes.json` is read and its argv/cwd/env/port recipe is run.

The HTTP server never calls a remote host. It only validates moves and atomically writes `game.json`; the orchestrator notices the local move signal and invokes the CLI sequence above.

## Responsibilities

| Abra provides | Blink Chess provides |
|---|---|
| Peer identity and pairing | Legal chess rules and SAN |
| Transport and trust | Board UI and side flip |
| Snapshot/DAG and content-addressed storage | `game.json` state model |
| Full-capsule transfer/delta sync | Clocks and game status |
| Lease records | Move → teleport orchestration |
| Durable outbox acknowledgement | Recipe runner and waiting presentation |

## Current Abra 0.1 limitation found

The current CLI durably transfers and materializes a full capsule snapshot, but `accept` does not restore `.abra/capsule_id`, and the receiver's capsule store does not advance the `main` label. Consequently, the new owner cannot immediately author the next snapshot: `abra snapshot` first reports a missing marker and then, if the marker is restored, `capsule already has a root snapshot`.

Blink Chess keeps this compatibility handling isolated in `teleport.mjs`: it restores the marker after accept and, when the missing remote label blocks authorship, uses the public `abra init` command to re-root the landed workspace before sending. `game.json` retains the complete move history, and the end-to-end teleport remains real, but capsule-DAG continuity across alternating authors is not yet preserved. Abra's backlog item is: **full capsule receive/accept must install the workspace binding and synchronize the head label so the receiver can snapshot the same capsule.** Remove the compatibility branch when that lands.

## Project layout

- `game/` — the teleported workspace: server, board, rules, and state.
- `abra.mjs` — thin public-CLI adapter.
- `teleport.mjs` — recipe runner and move handoff.
- `blink.mjs` — host/join experience.
- `test/` — rules tests and real two-daemon integration proof.
