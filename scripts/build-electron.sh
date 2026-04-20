#!/bin/bash
set -e

echo "=== Building AIMO Note Electron App ==="

# Build DTO package first
echo ">>> Building DTO package..."
pnpm --filter @aimo-note/dto build

# Build web app
echo ">>> Building web app..."
ELECTRON=true pnpm --filter @aimo-note/render build

# Build Electron main process
echo ">>> Building Electron main process..."
pnpm --filter @aimo-note/client run build:electron

# Build for current platform
echo ">>> Building distributable..."
case "$(uname -s)" in
  Darwin*)
    pnpm --filter @aimo-note/client run dist:mac
    ;;
  MINGW*|CYGWIN*|MSYS*)
    pnpm --filter @aimo-note/client run dist:win
    ;;
  Linux*)
    pnpm --filter @aimo-note/client run dist:linux
    ;;
esac

echo "=== Build complete ==="
echo "Output in apps/client/release/"
