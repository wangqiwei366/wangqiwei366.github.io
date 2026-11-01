#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."
family="${1:-iPhone}"
artifacts="$PWD/ci-artifacts"
mkdir -p "$artifacts"

xcodebuild -version | tee "$artifacts/xcode-version.log"
plutil -lint KimiBlog/Info.plist
xcodebuild -list -json -project KimiBlog.xcodeproj > "$artifacts/project.json"
xcrun simctl list devices available --json > "$artifacts/devices.json"
simulator_id="$(python3 ci/select_simulator.py --family "$family" "$artifacts/devices.json")"
xcrun simctl bootstatus "$simulator_id" -b | tee "$artifacts/simulator-boot.log"

xcodebuild test \
  -project KimiBlog.xcodeproj \
  -scheme KimiBlog \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$simulator_id" \
  -destination-timeout 120 \
  -parallel-testing-enabled NO \
  -derivedDataPath "$artifacts/DerivedData" \
  -resultBundlePath "$artifacts/Tests.xcresult" \
  CODE_SIGNING_ALLOWED=NO \
  | tee "$artifacts/tests.log"

app="$artifacts/DerivedData/Build/Products/Debug-iphonesimulator/KimiBlog.app"
xcrun simctl install "$simulator_id" "$app"
xcrun simctl ui "$simulator_id" appearance light
xcrun simctl launch "$simulator_id" com.kimi.blog | tee "$artifacts/launch.log"
sleep 3
xcrun simctl io "$simulator_id" screenshot "$artifacts/home-light.png"
xcrun simctl ui "$simulator_id" appearance dark
sleep 2
xcrun simctl io "$simulator_id" screenshot "$artifacts/home-dark.png"
xcrun simctl ui "$simulator_id" appearance light
for screen in archive article about; do
  xcrun simctl terminate "$simulator_id" com.kimi.blog || true
  xcrun simctl launch "$simulator_id" com.kimi.blog "--qa-$screen"
  sleep 3
  xcrun simctl io "$simulator_id" screenshot "$artifacts/$screen-light.png"
done
ditto -c -k --sequesterRsrc --keepParent "$app" "$artifacts/KimiBlog-$family-Simulator.zip"
