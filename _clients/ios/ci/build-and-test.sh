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
sleep 12
xcrun simctl io "$simulator_id" screenshot "$artifacts/home-light.png"
xcrun simctl ui "$simulator_id" appearance dark
sleep 2
xcrun simctl io "$simulator_id" screenshot "$artifacts/home-dark.png"
xcrun simctl ui "$simulator_id" appearance light
for screen in archive article about comments; do
  xcrun simctl terminate "$simulator_id" com.kimi.blog || true
  xcrun simctl launch "$simulator_id" com.kimi.blog "--qa-$screen"
  sleep 12
  xcrun simctl io "$simulator_id" screenshot "$artifacts/$screen-light.png"
done
ditto -c -k --sequesterRsrc --keepParent "$app" "$artifacts/KimiBlog-$family-Simulator.zip"

# Exercise the real card callback and capture intermediate native animation frames.
xcrun simctl terminate "$simulator_id" com.kimi.blog || true
container="$(xcrun simctl get_app_container "$simulator_id" com.kimi.blog data)"
rm -f "$container/Documents/qa-card-state.json"
xcrun simctl io "$simulator_id" recordVideo --codec=h264 --force "$artifacts/card-expansion.mp4" > "$artifacts/card-recording.log" 2>&1 &
recording_pid=$!
xcrun simctl launch "$simulator_id" com.kimi.blog --qa-motion
# Wait for the actual reader state; a busy simulator can miss fixed delays.
for attempt in {1..60}; do
  if python3 - "$container/Documents/qa-card-state.json" <<'PY'
import json,sys
try:
    state=json.load(open(sys.argv[1]))
    sys.exit(0 if state['phase']=='expanded' and state['width']>1 and state['height']>1 else 1)
except (OSError,ValueError,KeyError):
    sys.exit(1)
PY
  then break; fi
  sleep 1
done
sleep 2
kill -INT "$recording_pid" || true
wait "$recording_pid" || true
xcrun simctl io "$simulator_id" screenshot "$artifacts/card-expanded.png"

cp "$container/Documents/qa-card-state.json" "$artifacts/card-state.json"
python3 - "$artifacts/card-state.json" <<'PY'
import json,sys
state=json.load(open(sys.argv[1]))
assert state['phase']=='expanded',state
assert state['width']>1 and state['height']>1,state
print('PASS: article card callback reaches the expanded native reader:',state)
PY
