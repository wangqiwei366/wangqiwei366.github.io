"""Select an installed iOS simulator from simctl JSON without pinning a device name."""

import argparse
import json
import re
import sys
import uuid


def select_simulator(document, family):
    if family not in ("iPhone", "iPad"):
        raise ValueError("Simulator family must be iPhone or iPad.")
    candidates = []
    for runtime, devices in document.get("devices", {}).items():
        match = re.fullmatch(r"com\.apple\.CoreSimulator\.SimRuntime\.iOS-(\d+(?:-\d+)*)", runtime)
        if not match:
            continue
        version = tuple(int(part) for part in match.group(1).split("-"))
        if version[0] < 16:
            continue
        for device in devices:
            name = device.get("name", "")
            if not device.get("isAvailable") or not name.startswith(family + " "):
                continue
            try:
                uuid.UUID(device["udid"])
            except (KeyError, ValueError, TypeError, AttributeError):
                continue
            candidates.append((version, name, device["udid"]))
    if not candidates:
        raise ValueError(f"No available {family} simulator with iOS 16 or newer. Install an iOS Simulator runtime in Xcode.")
    newest = max(candidate[0] for candidate in candidates)
    return min(candidate for candidate in candidates if candidate[0] == newest)[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--family", choices=("iPhone", "iPad"), required=True)
    parser.add_argument("devices_json")
    arguments = parser.parse_args()
    try:
        with open(arguments.devices_json, encoding="utf-8") as source:
            print(select_simulator(json.load(source), arguments.family))
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
