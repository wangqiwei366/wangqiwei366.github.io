#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
artifacts="$PWD/ci-artifacts"
mkdir -p "$artifacts"

xcodebuild build \
  -project KimiBlog.xcodeproj \
  -scheme KimiBlog \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$artifacts/DeviceDerivedData" \
  -resultBundlePath "$artifacts/Release.xcresult" \
  CODE_SIGNING_ALLOWED=NO \
  | tee "$artifacts/release.log"
