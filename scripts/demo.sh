#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Blink Chess: real two-player Abra teleport demo"
node --test test/teleport.test.mjs
