#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Generating lockfile..."
cargo generate-lockfile

echo "==> Downgrading lockfile from v4 to v3..."
perl -0777 -pe 's/^version = 4$/version = 3/m' -i Cargo.lock

echo "==> Building SBF program..."
cargo build-sbf

echo "==> Build complete!"
