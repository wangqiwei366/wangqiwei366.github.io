import unittest

from select_simulator import select_simulator


class SimulatorSelectionTests(unittest.TestCase):
    def device(self, name, number, available=True):
        return {"name": name, "udid": f"00000000-0000-0000-0000-{number:012d}", "isAvailable": available}

    def test_newest_available_ios_and_requested_family(self):
        phone = self.device("iPhone 16", 1)
        tablet = self.device("iPad Air 11-inch (M3)", 2)
        document = {"devices": {
            "com.apple.CoreSimulator.SimRuntime.iOS-18-5": [phone, tablet],
            "com.apple.CoreSimulator.SimRuntime.iOS-17-5": [self.device("iPhone SE (3rd generation)", 3)],
            "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [self.device("iPhone 17", 4, False)],
            "com.apple.CoreSimulator.SimRuntime.tvOS-26-0": [self.device("iPhone Invalid", 5)],
        }}
        self.assertEqual(select_simulator(document, "iPhone"), phone["udid"])
        self.assertEqual(select_simulator(document, "iPad"), tablet["udid"])

    def test_runtime_versions_sort_numerically(self):
        current = self.device("iPhone 16", 1)
        document = {"devices": {
            "com.apple.CoreSimulator.SimRuntime.iOS-18-9": [self.device("iPhone 15", 2)],
            "com.apple.CoreSimulator.SimRuntime.iOS-18-10": [current],
        }}
        self.assertEqual(select_simulator(document, "iPhone"), current["udid"])

    def test_missing_or_unsupported_devices_fail_clearly(self):
        for document in ({}, {"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-15-5": [self.device("iPhone 13", 1)]}},
                         {"devices": {"com.apple.CoreSimulator.SimRuntime.iOS-18-5": [{"name": "iPhone 16", "isAvailable": True, "udid": "bad-id"}]}}):
            with self.assertRaisesRegex(ValueError, "No available iPhone"):
                select_simulator(document, "iPhone")

    def test_unknown_family_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "family"):
            select_simulator({}, "Mac")


if __name__ == "__main__":
    unittest.main()
