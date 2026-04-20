#!/bin/bash
set -e

echo "=== Triggering GitHub Actions Electron Build ==="

# Trigger workflow dispatch
gh workflow run build-electron.yml \
  --ref $(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD) \
  --field ref=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)

echo "=== Build triggered successfully ==="
