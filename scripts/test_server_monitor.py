"""Tests for server_monitor.evaluate (run: python3 -m unittest scripts/test_server_monitor.py)."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location(
    "server_monitor", pathlib.Path(__file__).with_name("server_monitor.py")
)
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)

HOUR = 3600


def service(**over):
    base = {"running": True, "health_ok": True, "restarts": 0, "failed_jobs": 0}
    base.update(over)
    return base


def observed(services=None, disk=40, mem=900, swap=0):
    return {
        "services": services or {"bandcoin-worker": service()},
        "disk_used_pct": disk,
        "mem_available_mb": mem,
        "swap_used_mb": swap,
    }


def run(obs, state=None, now=1_000_000):
    return sm.evaluate(obs, state or {}, now)


class Healthy(unittest.TestCase):
    def test_a_healthy_server_sends_nothing(self):
        mail, state = run(observed())
        self.assertIsNone(mail)
        self.assertEqual(state["problems"], {})

    def test_the_first_run_only_takes_a_baseline_of_failed_jobs_and_restarts(self):
        obs = observed({"bandcoin-worker": service(failed_jobs=2, restarts=3)})
        mail, state = run(obs)
        self.assertIsNone(mail)
        self.assertEqual(state["last"]["bandcoin-worker"], {"failed_jobs": 2, "restarts": 3})


class Down(unittest.TestCase):
    def test_one_bad_check_is_not_an_alert_two_in_a_row_are(self):
        bad = observed({"bandcoin-worker": service(health_ok=False)})
        mail, state = run(bad, now=1000)
        self.assertIsNone(mail)
        mail, state = run(bad, state, now=1300)
        self.assertIsNotNone(mail)
        self.assertIn("bandcoin-worker", mail["subject"])
        self.assertIn("not answering", mail["body"])

    def test_a_stopped_container_counts_as_down(self):
        bad = observed({"bandcoin-worker": service(running=False, health_ok=False)})
        _, state = run(bad, now=1000)
        mail, _ = run(bad, state, now=1300)
        self.assertIn("not running", mail["body"])

    def test_a_blip_that_recovers_between_checks_never_alerts(self):
        bad = observed({"bandcoin-worker": service(health_ok=False)})
        _, state = run(bad, now=1000)
        mail, state = run(observed(), state, now=1300)
        self.assertIsNone(mail)
        mail, _ = run(bad, state, now=1600)
        self.assertIsNone(mail)

    def test_a_standing_problem_is_not_repeated_within_six_hours_but_is_after(self):
        bad = observed({"bandcoin-worker": service(health_ok=False)})
        _, state = run(bad, now=0)
        mail, state = run(bad, state, now=300)
        self.assertIsNotNone(mail)
        mail, state = run(bad, state, now=300 + 5 * HOUR)
        self.assertIsNone(mail)
        mail, state = run(bad, state, now=300 + 6 * HOUR + 1)
        self.assertIsNotNone(mail)
        self.assertIn("still", mail["body"])

    def test_recovery_is_announced_once(self):
        bad = observed({"bandcoin-worker": service(health_ok=False)})
        _, state = run(bad, now=0)
        _, state = run(bad, state, now=300)
        mail, state = run(observed(), state, now=600)
        self.assertIn("recovered", mail["subject"].lower())
        mail, _ = run(observed(), state, now=900)
        self.assertIsNone(mail)


class Events(unittest.TestCase):
    def test_new_failed_jobs_are_reported_once(self):
        _, state = run(observed({"bandcoin-worker": service(failed_jobs=2)}), now=0)
        more = observed({"bandcoin-worker": service(failed_jobs=5)})
        mail, state = run(more, state, now=300)
        self.assertIn("3 new failed job", mail["body"])
        mail, _ = run(more, state, now=600)
        self.assertIsNone(mail)

    def test_a_restart_is_reported_once(self):
        _, state = run(observed({"bandcoin-worker": service(restarts=1)}), now=0)
        again = observed({"bandcoin-worker": service(restarts=2)})
        mail, state = run(again, state, now=300)
        self.assertIn("restarted", mail["body"])
        mail, _ = run(again, state, now=600)
        self.assertIsNone(mail)

    def test_a_redeploy_that_resets_the_counters_is_not_news(self):
        _, state = run(observed({"bandcoin-worker": service(failed_jobs=5, restarts=4)}), now=0)
        mail, state = run(observed({"bandcoin-worker": service(failed_jobs=0, restarts=0)}), state, now=300)
        self.assertIsNone(mail)
        self.assertEqual(state["last"]["bandcoin-worker"], {"failed_jobs": 0, "restarts": 0})

    def test_a_service_without_a_failed_count_is_fine(self):
        obs = observed({"bandcoin-worker": service(failed_jobs=None)})
        mail, _ = run(obs)
        self.assertIsNone(mail)


class Resources(unittest.TestCase):
    def test_a_full_disk_alerts_and_clears(self):
        # disk has no two-check delay: it is a trend, not a blip
        mail, state = run(observed(disk=90), now=0)
        self.assertIsNotNone(mail)
        self.assertEqual(list(state["problems"]), ["disk"])
        mail, _ = run(observed(disk=60), state, now=600)
        self.assertIn("recovered", mail["subject"].lower())

    def test_low_memory_and_heavy_swap_are_problems(self):
        mail, state = run(observed(mem=80, swap=900))
        self.assertEqual(sorted(state["problems"]), ["memory", "swap"])
        self.assertIn("memory", mail["body"].lower())

    def test_disk_at_the_limit_alerts_just_below_does_not(self):
        self.assertIn("disk", run(observed(disk=85))[1]["problems"])
        self.assertNotIn("disk", run(observed(disk=84))[1]["problems"])


class Mixed(unittest.TestCase):
    def test_everything_wrong_at_once_is_one_email(self):
        obs = observed(
            {
                "bandcoin-worker": service(health_ok=False, failed_jobs=9),
                "wadzzo-worker": service(running=False, health_ok=False),
            },
            disk=95,
        )
        first, state = run(obs, now=0)
        self.assertIn("disk", first["body"].lower())  # a full disk needs no second look
        mail, _ = run(obs, state, now=300)
        self.assertIn("bandcoin-worker", mail["body"])
        self.assertIn("wadzzo-worker", mail["body"])

    def test_a_missing_optional_service_is_not_checked(self):
        mail, state = run(observed({"bandcoin-worker": service()}))
        self.assertIsNone(mail)
        self.assertNotIn("wadzzo-worker", state["last"])


class Names(unittest.TestCase):
    def test_it_watches_the_containers_the_servers_really_run(self):
        # A wrong name is silent: an optional container that isn't found is simply skipped.
        self.assertEqual(
            [(name, port, required) for name, port, required in sm.SERVICES],
            [("bandcoin-worker", 8080, True), ("wadzzo-worker", 4000, False)],
        )


if __name__ == "__main__":
    unittest.main()
