#!/usr/bin/env -S /home/kingler/.local/bin/uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["sendgrid>=6.11", "python-dotenv>=1.0"]
# ///
"""
VividWalls — Art of Space Newsletter Opt-In Batch Sender

Sends permission-pass opt-in emails in daily batches of 200.
Tracks sent contacts in a local state file to avoid duplicates.
Uses SendGrid Export API to fetch all 2k+ contacts reliably.

Usage:
    python3 send-optin-batch.py prepare   # Preview next batch (dry run)
    python3 send-optin-batch.py send      # Send the next 200
    python3 send-optin-batch.py status    # Show progress
    python3 send-optin-batch.py reset     # Reset state (re-send all)
"""

import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, To

# ── Config ──────────────────────────────────────────────────────────────

BATCH_SIZE = 200
TEMPLATE_ID = "d-f8ee0dcceb484e8aaa5f4c3e2d49e319"  # Commercial Prospects - Opt-In
FROM_EMAIL = "kingler@vividwalls.co"
FROM_NAME = "VividWalls"

# State file lives next to this script
SCRIPT_DIR = Path(__file__).parent
STATE_FILE = SCRIPT_DIR / "optin-batch-state.json"
CONTACTS_CACHE = SCRIPT_DIR / "optin-contacts-cache.json"
LOG_FILE = SCRIPT_DIR / "optin-batch-log.jsonl"

# Load .env from openclaw-mabos root
ENV_FILE = SCRIPT_DIR.parent.parent / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)

API_KEY = os.environ.get("SENDGRID_API_KEY")
if not API_KEY:
    print("ERROR: SENDGRID_API_KEY not set", file=sys.stderr)
    sys.exit(1)

sg = SendGridAPIClient(API_KEY)


# ── State Management ───────────────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {
        "sent_emails": [],
        "total_fetched": 0,
        "batches_sent": 0,
        "last_batch_at": None,
        "errors": [],
        "started_at": datetime.now(timezone.utc).isoformat(),
    }


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def log_event(event: dict):
    event["timestamp"] = datetime.now(timezone.utc).isoformat()
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(event) + "\n")


# ── SendGrid Contact Fetching ─────────────────────────────────────────

def fetch_all_contacts_via_export() -> list[dict]:
    """Export all contacts from SendGrid Marketing API (handles 2k+ reliably)."""

    # Check for a recent cache (< 6 hours old) to avoid hammering the export API
    if CONTACTS_CACHE.exists():
        cache = json.loads(CONTACTS_CACHE.read_text())
        cached_at = cache.get("fetched_at", "")
        if cached_at:
            age_hours = (
                datetime.now(timezone.utc)
                - datetime.fromisoformat(cached_at)
            ).total_seconds() / 3600
            if age_hours < 6:
                contacts = cache.get("contacts", [])
                print(f"  Using cached contacts ({len(contacts)}, {age_hours:.1f}h old)")
                return contacts

    print("  Starting SendGrid contact export...")
    response = sg.client.marketing.contacts.exports.post(
        request_body={"file_type": "json", "max_file_size": 5000}
    )
    if response.status_code not in (200, 202):
        print(f"ERROR: Export request failed: {response.status_code}", file=sys.stderr)
        print(response.body.decode(), file=sys.stderr)
        sys.exit(1)

    export_data = json.loads(response.body)
    export_id = export_data.get("id")
    if not export_id:
        print(f"ERROR: No export ID returned: {export_data}", file=sys.stderr)
        sys.exit(1)

    print(f"  Export ID: {export_id}")

    # Poll until complete (max 10 minutes)
    for attempt in range(120):
        time.sleep(5)
        status_resp = sg.client.marketing.contacts.exports._(export_id).get()
        status_data = json.loads(status_resp.body)
        status = status_data.get("status", "unknown")

        if attempt % 6 == 0:  # Log every 30 seconds
            print(f"  Export status: {status} (attempt {attempt + 1})")

        if status == "ready":
            urls = status_data.get("urls", [])
            if not urls:
                print("ERROR: Export ready but no download URLs", file=sys.stderr)
                sys.exit(1)

            all_contacts = []
            for url in urls:
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=120) as resp:
                    import gzip; raw = resp.read(); content = gzip.decompress(raw).decode("utf-8") if raw[:2] == b"\x1f\x8b" else raw.decode("utf-8")
                    for line in content.strip().split("\n"):
                        if line.strip():
                            try:
                                contact = json.loads(line)
                                if contact.get("email"):
                                    all_contacts.append({
                                        "email": contact["email"],
                                        "first_name": contact.get("first_name", ""),
                                        "last_name": contact.get("last_name", ""),
                                    })
                            except json.JSONDecodeError:
                                continue

            print(f"  Exported {len(all_contacts)} contacts")

            # Cache the results
            CONTACTS_CACHE.write_text(json.dumps({
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "contacts": all_contacts,
            }, indent=2))

            return all_contacts

        if status == "failure":
            print(f"ERROR: Export failed: {status_data}", file=sys.stderr)
            sys.exit(1)

    print("ERROR: Export timed out after 10 minutes", file=sys.stderr)
    sys.exit(1)


# ── Batch Sending ──────────────────────────────────────────────────────

def send_batch(contacts: list[dict], dry_run: bool = False) -> dict:
    """Send opt-in emails to a batch of contacts."""
    results = {"sent": 0, "failed": 0, "skipped": 0, "errors": []}

    for i, contact in enumerate(contacts, 1):
        email = contact.get("email", "")
        first_name = contact.get("first_name", "")
        last_name = contact.get("last_name", "")

        if not email:
            results["skipped"] += 1
            continue

        if dry_run:
            print(f"  [{i:3d}/{len(contacts)}] [DRY RUN] {email} ({first_name} {last_name})")
            results["sent"] += 1
            continue

        try:
            message = Mail(
                from_email=(FROM_EMAIL, FROM_NAME),
                to_emails=To(
                    email=email,
                    dynamic_template_data={
                        "first_name": first_name or "there",
                        "last_name": last_name or "",
                        "email": email,
                    },
                ),
            )
            message.template_id = TEMPLATE_ID

            response = sg.send(message)

            if response.status_code in (200, 201, 202):
                results["sent"] += 1
                if i % 25 == 0:
                    print(f"  [{i:3d}/{len(contacts)}] Sent {i} emails...")
            else:
                results["failed"] += 1
                results["errors"].append({
                    "email": email,
                    "status": response.status_code,
                    "body": response.body.decode() if response.body else "",
                })

            # Rate limit: ~3 emails/sec = safe for SendGrid paid plans
            time.sleep(0.3)

        except Exception as e:
            results["failed"] += 1
            results["errors"].append({"email": email, "error": str(e)})

    return results


# ── Commands ───────────────────────────────────────────────────────────

def cmd_prepare():
    """Preview the next batch without sending."""
    state = load_state()
    sent_set = set(state["sent_emails"])

    print("Fetching contacts from SendGrid...")
    contacts = fetch_all_contacts_via_export()
    print(f"Total contacts: {len(contacts)}")

    unsent = [c for c in contacts if c.get("email") not in sent_set]
    print(f"Already sent: {len(sent_set)}")
    print(f"Remaining: {len(unsent)}")

    batch = unsent[:BATCH_SIZE]
    if not batch:
        print("\nAll contacts have been sent opt-in emails!")
        return

    print(f"\nNext batch: {len(batch)} contacts")
    print("─" * 60)
    results = send_batch(batch, dry_run=True)
    print("─" * 60)
    print(f"Ready to send: {results['sent']}")
    print(f"Skipped (no email): {results['skipped']}")
    print(f"\nRun with 'send' to execute.")


def cmd_send():
    """Send the next batch of opt-in emails."""
    state = load_state()
    sent_set = set(state["sent_emails"])

    print("Fetching contacts from SendGrid...")
    contacts = fetch_all_contacts_via_export()
    print(f"Total contacts: {len(contacts)}")

    unsent = [c for c in contacts if c.get("email") not in sent_set]
    print(f"Already sent: {len(sent_set)}")
    print(f"Remaining: {len(unsent)}")

    batch = unsent[:BATCH_SIZE]
    if not batch:
        msg = "All contacts have been sent opt-in emails! Nothing to do."
        print(f"\n{msg}")
        log_event({"action": "send", "result": "complete", "total_sent": len(sent_set)})
        return

    print(f"\nSending batch of {len(batch)}...")
    print("─" * 60)
    results = send_batch(batch, dry_run=False)
    print("─" * 60)

    # Update state — mark successfully sent emails
    failed_emails = {e.get("email") for e in results["errors"]}
    newly_sent = [
        c["email"] for c in batch
        if c.get("email") and c["email"] not in failed_emails
    ]

    state["sent_emails"].extend(newly_sent)
    state["batches_sent"] += 1
    state["total_fetched"] = len(contacts)
    state["last_batch_at"] = datetime.now(timezone.utc).isoformat()
    if results["errors"]:
        # Keep only last 20 errors to avoid state bloat
        state["errors"] = (state["errors"] + results["errors"])[-20:]
    save_state(state)

    remaining = len(unsent) - len(newly_sent)
    log_event({
        "action": "send",
        "batch_size": len(batch),
        "sent": results["sent"],
        "failed": results["failed"],
        "skipped": results["skipped"],
        "total_sent_cumulative": len(state["sent_emails"]),
        "remaining": remaining,
    })

    print(f"\nResults:")
    print(f"  Sent: {results['sent']}")
    print(f"  Failed: {results['failed']}")
    print(f"  Skipped: {results['skipped']}")
    print(f"  Total sent (all batches): {len(state['sent_emails'])}")
    print(f"  Remaining: {remaining}")
    days_left = remaining // BATCH_SIZE + (1 if remaining % BATCH_SIZE else 0)
    print(f"  Est. days to complete: {days_left}")

    if results["errors"]:
        print(f"\nErrors ({len(results['errors'])}):")
        for err in results["errors"][:5]:
            print(f"  - {err.get('email', '?')}: {err.get('error', err.get('status', '?'))}")


def cmd_status():
    """Show current batch progress."""
    state = load_state()
    sent_count = len(state["sent_emails"])
    total = state.get("total_fetched", 0)
    remaining = max(0, total - sent_count)
    days_left = remaining // BATCH_SIZE + (1 if remaining % BATCH_SIZE else 0)
    pct = (sent_count / total * 100) if total else 0

    print("═" * 60)
    print("  VividWalls — Art of Space Opt-In Batch Status")
    print("═" * 60)
    print(f"  Started:         {state.get('started_at', 'N/A')}")
    print(f"  Last batch:      {state.get('last_batch_at', 'Never')}")
    print(f"  Batches sent:    {state.get('batches_sent', 0)}")
    print(f"  Emails sent:     {sent_count} / {total} ({pct:.1f}%)")
    print(f"  Remaining:       {remaining}")
    print(f"  Batch size:      {BATCH_SIZE}/day")
    print(f"  Est. completion: {days_left} day(s)")
    print(f"  Template:        {TEMPLATE_ID}")
    print(f"  From:            {FROM_NAME} <{FROM_EMAIL}>")

    if state.get("errors"):
        print(f"\n  Recent errors ({len(state['errors'])}):")
        for err in state["errors"][-3:]:
            print(f"    - {err.get('email', '?')}: {err.get('error', err.get('status', '?'))}")
    print("═" * 60)


def cmd_reset():
    """Reset state to re-send all contacts."""
    if STATE_FILE.exists():
        STATE_FILE.unlink()
    if CONTACTS_CACHE.exists():
        CONTACTS_CACHE.unlink()
    print("State and cache reset. Next 'send' will start from the beginning.")
    log_event({"action": "reset"})


# ── Main ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "prepare"

    commands = {
        "prepare": cmd_prepare,
        "send": cmd_send,
        "status": cmd_status,
        "reset": cmd_reset,
    }

    if action not in commands:
        print(f"Unknown action: {action}")
        print(f"Usage: {sys.argv[0]} [{' | '.join(commands.keys())}]")
        sys.exit(1)

    commands[action]()
