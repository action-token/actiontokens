#!/usr/bin/env python3
"""Watches the worker server and emails when something is wrong.

Runs ON THE SERVER from cron, every 5 minutes:
  */5 * * * * /home/ubuntu/bandcoin/server_monitor.py >> /home/ubuntu/bandcoin/monitor.log 2>&1

Mails once when a problem appears (a container down for two checks in a row, a disk, memory or
swap running out), again after 6 hours if it is still there, and once when it clears. New failed
jobs and container restarts are reported once each. Nothing is sent while everything is fine.
Mail goes through the SMTP settings in worker.env (Gmail), to ALERT_TO.

  server_monitor.py --dry-run     print what would be sent, change nothing
  server_monitor.py --test-mail   send one test message

The decisions are in evaluate(), which has no I/O, so it can be tested
(python3 -m unittest scripts/test_server_monitor.py).
"""
import copy
import json
import os
import shutil
import smtplib
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from email.message import EmailMessage

HOME = os.path.expanduser("~")
STATE_PATH = os.environ.get("MONITOR_STATE", f"{HOME}/bandcoin/monitor-state.json")
ENV_PATH = os.environ.get("MONITOR_ENV", f"{HOME}/bandcoin/worker.env")
ALERT_TO = os.environ.get("ALERT_TO", "support@bandcoin.io")

# (container, port on this machine, required: a missing container counts as down)
SERVICES = [("bandcoin-worker", 8080, True), ("wadzzo-worker", 4000, False)]

DOWN_CHECKS = 2  # bad checks in a row before it is a problem (a deploy takes one)
REPEAT_AFTER_S = 6 * 3600
DISK_PCT = 85
MEMORY_MB = 150
SWAP_MB = 800


def evaluate(observed, state, now):
    """Decide what to say. Returns (mail or None, the state to keep)."""
    state = copy.deepcopy(state)
    old_problems = state.get("problems", {})
    streak = state.get("bad_streak", {})
    last = state.get("last", {})

    problems = {}  # key -> text, true right now
    events = []  # (label, text), reported once

    for name, svc in observed["services"].items():
        bad = not svc["running"] or not svc["health_ok"]
        streak[name] = streak.get(name, 0) + 1 if bad else 0
        if streak[name] >= DOWN_CHECKS:
            problems[f"{name}:down"] = (
                f"{name} is not running"
                if not svc["running"]
                else f"{name} is running but not answering /health"
            )
        current = {"failed_jobs": svc.get("failed_jobs"), "restarts": svc.get("restarts")}
        before = last.get(name)
        if before is not None:
            cf, bf = current["failed_jobs"], before.get("failed_jobs")
            if cf is not None and bf is not None and cf > bf:
                events.append((f"{name} failed jobs", f"{name}: {cf - bf} new failed job(s) (total {cf})"))
            cr, br = current["restarts"], before.get("restarts")
            if cr is not None and br is not None and cr > br:
                events.append((f"{name} restarted", f"{name} restarted {cr - br} time(s) on its own"))
        last[name] = current

    if observed["disk_used_pct"] >= DISK_PCT:
        problems["disk"] = f"the disk is {observed['disk_used_pct']}% full"
    if observed["mem_available_mb"] < MEMORY_MB:
        problems["memory"] = f"memory is low: {observed['mem_available_mb']} MB available"
    if observed["swap_used_mb"] > SWAP_MB:
        problems["swap"] = f"swap is nearly used up: {observed['swap_used_mb']} MB"

    lines, labels, kept = [], [], {}
    for key, text in problems.items():
        known = old_problems.get(key)
        if known is None:
            kept[key] = {"since": now, "last_alert": now}
            lines.append(text)
            labels.append(key.replace(":", " "))
        else:
            kept[key] = dict(known)
            if now - known["last_alert"] >= REPEAT_AFTER_S:
                kept[key]["last_alert"] = now
                lines.append(f"{text} (still the case)")
                labels.append(key.replace(":", " "))
    for label, text in events:
        lines.append(text)
        labels.append(label)
    recovered = [key.replace(":", " ") for key in old_problems if key not in problems]

    new_state = {"problems": kept, "bad_streak": streak, "last": last}
    if not lines and not recovered:
        return None, new_state

    parts = []
    if lines:
        parts.append("Needs a look:\n" + "\n".join(f"  - {line}" for line in lines))
    if recovered:
        parts.append("Recovered:\n" + "\n".join(f"  - {name}" for name in recovered))
    parts.append(
        f"Server: {socket.gethostname()}\n"
        "Logs: docker logs bandcoin-worker (or wadzzo-worker). Failed jobs: Admin > Jobs."
    )
    subject = (
        "[Bandcoin server] " + ", ".join(labels)
        if lines
        else "[Bandcoin server] Recovered: " + ", ".join(recovered)
    )
    return {"subject": subject[:120], "body": "\n\n".join(parts)}, new_state


# ── I/O ────────────────────────────────────────────────────────────────────────


def docker_state(name):
    out = subprocess.run(
        ["docker", "inspect", name, "--format", "{{.State.Status}}|{{.RestartCount}}"],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if out.returncode != 0:
        return None
    status, restarts = out.stdout.strip().split("|")
    return {"running": status == "running", "restarts": int(restarts)}


def fetch_health(port):
    """(answered 200, parsed body or {})"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5) as resp:
            return resp.status == 200, json.loads(resp.read() or b"{}")
    except (urllib.error.URLError, OSError, ValueError):
        return False, {}


def failed_count(body):
    value = body.get("failed")
    if value is None and isinstance(body.get("jobs"), dict):
        value = body["jobs"].get("failed")
    return value if isinstance(value, int) else None


def meminfo():
    values = {}
    with open("/proc/meminfo") as handle:
        for line in handle:
            key, rest = line.split(":", 1)
            values[key] = int(rest.split()[0]) // 1024
    return values


def observe():
    services = {}
    for name, port, required in SERVICES:
        info = docker_state(name)
        if info is None:
            if required:
                services[name] = {"running": False, "health_ok": False, "restarts": None, "failed_jobs": None}
            continue
        ok, body = fetch_health(port) if info["running"] else (False, {})
        services[name] = {
            "running": info["running"],
            "health_ok": ok,
            "restarts": info["restarts"],
            "failed_jobs": failed_count(body),
        }
    usage = shutil.disk_usage("/")
    mem = meminfo()
    return {
        "services": services,
        "disk_used_pct": round(usage.used * 100 / usage.total),
        "mem_available_mb": mem["MemAvailable"],
        "swap_used_mb": mem.get("SwapTotal", 0) - mem.get("SwapFree", 0),
    }


def read_env(path):
    values = {}
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key] = value.strip().strip("\"'")
    return values


def send(mail):
    env = read_env(ENV_PATH)
    message = EmailMessage()
    message["From"] = env["MAIL_FROM"]
    message["To"] = ALERT_TO
    message["Subject"] = mail["subject"]
    message.set_content(mail["body"])
    with smtplib.SMTP(env["SMTP_HOST"], int(env.get("SMTP_PORT", "587")), timeout=30) as smtp:
        smtp.starttls()
        smtp.login(env["SMTP_USER"], env["SMTP_PASS"])
        smtp.send_message(message)


def load_state():
    try:
        with open(STATE_PATH) as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def save_state(state):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w") as handle:
        json.dump(state, handle)
    os.replace(tmp, STATE_PATH)


def main(argv):
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    if "--test-mail" in argv:
        send({"subject": "[Bandcoin server] Test alert", "body": "The server monitor can send mail. Nothing is wrong."})
        print(f"{stamp} test mail sent to {ALERT_TO}")
        return 0
    observed = observe()
    mail, state = evaluate(observed, load_state(), time.time())
    if mail is None:
        if "--dry-run" in argv:
            print(f"{stamp} nothing to report: {json.dumps(observed)}")
        else:
            save_state(state)
        return 0
    if "--dry-run" in argv:
        print(f"{stamp} would send:\n{mail['subject']}\n{mail['body']}")
        return 0
    try:
        send(mail)
    except Exception as error:  # keep the old state, so the next run tries again
        print(f"{stamp} could not send '{mail['subject']}': {error}")
        return 1
    save_state(state)
    print(f"{stamp} sent: {mail['subject']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
