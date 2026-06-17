#!/usr/bin/env python3
"""
Automated evaluation pipeline for agent reputation.

Runs the setup script, then executes each round daml script via docker exec,
fetches rankings after each round, and prints the DATA block ready to paste
into plot_reputation.py.

Usage:
    python fetch_rankings.py [options]

Options:
    --url         Base URL of the reputation engine  (default: http://localhost:8080)
    --container   Docker container name              (default: canton-sandbox)
    --dar         DAR path inside the container      (default: /app/daml/.daml/dist/reputation-0.0.1.dar)
    --ledger-host Ledger host inside container       (default: localhost)
    --ledger-port Ledger port                        (default: 6865)
    --rounds      Number of rounds to run (1-N)      (default: auto-detect from evaluation/ .daml files)
    --skip-setup  Skip running EvalSeedAgentSetup
    --role-type   Role type to filter for output     (default: Agent)
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import time
import urllib.request


# ── Helpers ───────────────────────────────────────────────────────────────────

def fetch_rankings(base_url: str) -> list:
    url = f"{base_url}/rankings"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


def short_name(party: str) -> str:
    return party.split("::")[0]


def extract_scores(data: list, role_type: str) -> dict:
    """Returns {agent_name: {component: score, ...}} for the given role type."""
    result = {}
    for subject in data:
        if subject.get("roleType") != role_type:
            continue
        name = short_name(subject["party"])
        comps = {c["componentId"]: round(c["score"], 1) for c in subject["components"]}
        result[name] = comps
    return result


def run_daml_script(container: str, dar: str, script_name: str,
                    ledger_host: str, ledger_port: int) -> bool:
    """Runs a daml script via docker exec. Returns True on success."""
    cmd = [
        "docker", "exec", container,
        "daml", "script",
        "--dar", dar,
        "--script-name", script_name,
        "--ledger-host", ledger_host,
        "--ledger-port", str(ledger_port),
    ]
    print(f"  Running: {script_name} ... ", end="", flush=True)
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("FAILED")
        print(f"    stderr: {result.stderr.strip()[:300]}", file=sys.stderr)
        return False
    print("OK")
    return True


def detect_round_count(eval_dir: str) -> int:
    """Count EvalSeedAgentRound*.daml files in the evaluation directory."""
    pattern = os.path.join(eval_dir, "EvalSeedAgentRound*.daml")
    files = glob.glob(pattern)
    if not files:
        print(f"  WARNING: No EvalSeedAgentRound*.daml files found in {eval_dir!r}")
        print("  Use --rounds N to set the round count explicitly.")
        return 4
    nums = []
    for f in files:
        base = os.path.basename(f)
        try:
            nums.append(int(base.replace("EvalSeedAgentRound", "").replace(".daml", "")))
        except ValueError:
            pass
    count = max(nums) if nums else 4
    print(f"  Auto-detected {count} rounds from {eval_dir!r}")
    return count


def build_data_block(rounds_data: list, agents: list, components: list) -> str:
    """Format the rounds_data into the DATA dict for plot_reputation.py."""
    # rounds_data[i] = {agent: {component: score}} for round i (0 = prior)
    lines = ["DATA = {"]
    for agent in agents:
        lines.append(f'    "{agent}": {{')
        for comp in components:
            values = []
            for rd in rounds_data:
                score = rd.get(agent, {}).get(comp, 50.0)
                values.append(int(score) if score == int(score) else score)
            lines.append(f'        "{comp}": {values},')
        lines.append("    },")
    lines.append("}")
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))

    parser = argparse.ArgumentParser(description="Automated reputation evaluation pipeline")
    parser.add_argument("--url",          default="http://localhost:8080")
    parser.add_argument("--container",    default="canton-sandbox")
    parser.add_argument("--dar",          default="/app/daml/.daml/dist/reputation-0.0.1.dar")
    parser.add_argument("--ledger-host",  default="localhost")
    parser.add_argument("--ledger-port",  default=6865, type=int)
    parser.add_argument("--rounds",       default=25, type=int,
                        help="Number of rounds to run (default: auto-detect)")
    parser.add_argument("--skip-setup",   action="store_true",
                        help="Skip the EvalSeedAgentSetup script")
    parser.add_argument("--role-type",    default="Agent",
                        help="Role type to collect scores for (default: Agent)")
    parser.add_argument("--delay",        default=2.0, type=float,
                        help="Seconds to wait after each daml script before fetching (default: 2)")
    args = parser.parse_args()

    n_rounds = args.rounds or detect_round_count(script_dir)
    print(f"Evaluation pipeline: {n_rounds} rounds | container={args.container} | url={args.url}")
    print()

    # ── Step 1: Setup ─────────────────────────────────────────────────────────
    if not args.skip_setup:
        print("Step 1: Running EvalSeedAgentSetup ...")
        ok = run_daml_script(
            args.container, args.dar,
            "Scripts.EvalSeedAgentSetup:evalSeedAgentSetup",
            args.ledger_host, args.ledger_port,
        )
        if not ok:
            print("  WARNING: Setup failed — continuing anyway (ledger may already be set up)")
        time.sleep(args.delay)
    else:
        print("Step 1: Skipping setup (--skip-setup)")

    # ── Step 2: Fetch prior (round 0) ─────────────────────────────────────────
    print("\nFetching round 0 (prior) ...")
    round0_data = fetch_rankings(args.url)
    rounds_data = [extract_scores(round0_data, args.role_type)]
    print(f"  Found {len(rounds_data[0])} {args.role_type}(s): {list(rounds_data[0].keys())}")

    # ── Step 3: Run each round ────────────────────────────────────────────────
    for i in range(1, n_rounds + 1):
        module = f"EvalSeedAgentRound{i}"
        fn     = f"evalSeedAgentRound{i}"
        print(f"\nRound {i}/{n_rounds}:")
        ok = run_daml_script(
            args.container, args.dar,
            f"Scripts.{module}:{fn}",
            args.ledger_host, args.ledger_port,
        )
        if not ok:
            print(f"  Skipping fetch for round {i} due to script failure.")
            # Carry forward last round's data so the list stays aligned
            rounds_data.append(dict(rounds_data[-1]))
            continue

        time.sleep(args.delay)
        print(f"  Fetching rankings after round {i} ... ", end="", flush=True)
        rd = fetch_rankings(args.url)
        scores = extract_scores(rd, args.role_type)
        rounds_data.append(scores)
        print("OK")

        # Show inline table
        agents_in_round = sorted(scores.keys())
        for agent in agents_in_round:
            c = scores[agent]
            overall = round(
                c.get("Reliability", 50) * 0.5 +
                c.get("Responsiveness", 50) * 0.3 +
                c.get("Accuracy", 50) * 0.2, 1
            )
            print(f"    {agent:<22} Overall={overall:5.1f}  "
                  f"Rel={c.get('Reliability',50):5.1f}  "
                  f"Resp={c.get('Responsiveness',50):5.1f}  "
                  f"Acc={c.get('Accuracy',50):5.1f}")

    # ── Step 4: Build DATA block ───────────────────────────────────────────────
    all_agents = sorted({a for rd in rounds_data for a in rd})
    all_comps  = ["Reliability", "Responsiveness", "Accuracy"]

    round_labels = ["Prior"] + [f"TX-{i}" for i in range(1, n_rounds + 1)]

    print("\n" + "═" * 72)
    print("DATA block for plot_reputation.py")
    print("═" * 72)
    print()
    print(f"# Each list: [{', '.join(round_labels)}]")
    print()
    print(build_data_block(rounds_data, all_agents, all_comps))
    print()
    print(f'ROUNDS = {round_labels}')
    print()


if __name__ == "__main__":
    main()
