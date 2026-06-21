#!/usr/bin/env python3
import argparse
import glob
import json
import os
import subprocess
import sys
import time
import urllib.request

import matplotlib.colors as mcolors
import matplotlib.lines as mlines
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np

WEIGHTS = {"Reliability": 0.5, "Responsiveness": 0.3, "Accuracy": 0.2}

PREFERRED_AGENT_ORDER = ["AgentPro", "AgentHighReject", "AgentSlowUploader", "AgentUnreliable"]
KNOWN_AGENT_COLORS = {
    "AgentPro":          "#2563EB",
    "AgentHighReject":   "#7C3AED",
    "AgentSlowUploader": "#059669",
    "AgentUnreliable":   "#DC2626",
}


def fetch_rankings(base_url: str) -> list:
    url = f"{base_url}/rankings"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


def short_name(party: str) -> str:
    return party.split("::")[0]


def extract_scores(data: list, role_type: str) -> dict:
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


def count_round_events(daml_dir: str, round_num: int) -> int:
    path = os.path.join(daml_dir, f"EvalSeedAgentRound{round_num}.daml")
    if not os.path.isfile(path):
        return 0
    with open(path) as f:
        content = f.read()
    return content.count("RecordEvent with") + content.count("SubmitFeedback with")


def detect_round_count(eval_dir: str) -> int:
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


def plot_reputation(rounds_data: list, agents: list, components: list,
                     round_labels: list, weights: dict,
                     output_path: str = "reputation_evolution.png") -> None:
    n = len(round_labels)
    x = np.arange(n)

    agents = [a for a in PREFERRED_AGENT_ORDER if a in agents] + \
             [a for a in agents if a not in PREFERRED_AGENT_ORDER]

    data = {
        agent: {
            comp: [rounds_data[i].get(agent, {}).get(comp, 50.0) for i in range(n)]
            for comp in components
        }
        for agent in agents
    }
    for agent in agents:
        data[agent]["Overall"] = [
            round(sum(weights[c] * data[agent][c][i] for c in weights), 1)
            for i in range(n)
        ]

    known_rgb = {mcolors.to_rgb(c) for c in KNOWN_AGENT_COLORS.values()}
    palette = [c for c in plt.get_cmap("tab10").colors if c not in known_rgb]
    line_style_cycle = [
        dict(linestyle="-", marker="o"),
        dict(linestyle="--", marker="s"),
        dict(linestyle="-.", marker="^"),
        dict(linestyle=":", marker="D"),
    ]
    fallback_i = 0
    colors = {}
    for a in agents:
        if a in KNOWN_AGENT_COLORS:
            colors[a] = KNOWN_AGENT_COLORS[a]
        else:
            colors[a] = palette[fallback_i % len(palette)]
            fallback_i += 1
    styles = {
        a: {**line_style_cycle[i % len(line_style_cycle)], "linewidth": 2.0, "markersize": 5}
        for i, a in enumerate(agents)
    }

    panels = components + ["Overall"]
    fig, axes = plt.subplots(2, 2, figsize=(16, 10))
    axes = axes.flatten()

    for ax, comp in zip(axes, panels):
        for agent in agents:
            ax.plot(x, data[agent][comp], color=colors[agent], **styles[agent], zorder=3)

        ax.axhline(50, color="#9CA3AF", linestyle="--", linewidth=0.9,
                   zorder=1, alpha=0.7, label="_nolegend_")

        if comp == "Overall":
            weight_str = " + ".join(f"{c[:4]}×{w}" for c, w in weights.items())
            ax.set_title(f"Overall  ({weight_str})", fontsize=10, fontweight="bold", pad=6)
        else:
            ax.set_title(comp, fontsize=10, fontweight="bold", pad=6)

        step = max(1, (n - 1) // 10) if n > 1 else 1
        shown = list(range(0, n, step))
        if (n - 1) not in shown:
            shown.append(n - 1)
        ax.set_xticks(shown)
        ax.set_xticklabels([round_labels[i] for i in shown], fontsize=8, rotation=45, ha="right")
        ax.set_xlim(-0.4, max(n - 0.6, 0.6))
        ax.set_ylim(0, 100)
        ax.set_ylabel("Score (0-100)", fontsize=9)
        ax.yaxis.set_major_locator(mticker.MultipleLocator(20))
        ax.grid(axis="y", linestyle="--", linewidth=0.5, alpha=0.4, zorder=0)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)

    legend_handles = [
        mlines.Line2D([0], [0], color=colors[a], label=a, **styles[a])
        for a in agents
    ]
    legend_handles.append(
        mlines.Line2D([0], [0], color="#9CA3AF", linestyle="--", linewidth=0.9, label="Prior (50)")
    )
    fig.legend(
        handles=legend_handles, loc="lower center", ncol=min(5, len(legend_handles)),
        fontsize=9, frameon=False, bbox_to_anchor=(0.5, 0.0),
    )

    fig.suptitle("Agent Reputation Evolution across Interactions",
                fontsize=13, fontweight="bold", y=0.99)

    plt.tight_layout(rect=[0, 0.06, 1, 0.97])
    plt.savefig(output_path, dpi=150, bbox_inches="tight")
    print(f"  Saved plot to {output_path!r}")
    plt.show()


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
    parser.add_argument("--plot-output",  default=os.path.join(script_dir, "reputation_evolution.png"),
                        help="Output path for the reputation evolution plot")
    parser.add_argument("--no-plot",      action="store_true",
                        help="Skip generating the reputation evolution plot")
    parser.add_argument("--daml-dir",
                        default=os.path.join(script_dir, "..", "..", "reputation-system",
                                             "canton", "daml", "Scripts"),
                        help="Directory containing EvalSeedAgentRound*.daml scripts "
                             "(used to count score-affecting events per round)")
    args = parser.parse_args()

    n_rounds = args.rounds or detect_round_count(script_dir)
    print(f"Evaluation pipeline: {n_rounds} rounds | container={args.container} | url={args.url}")
    print()

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

    print("\nFetching round 0 (prior) ...")
    round0_data = fetch_rankings(args.url)
    rounds_data = [extract_scores(round0_data, args.role_type)]
    print(f"  Found {len(rounds_data[0])} {args.role_type}(s): {list(rounds_data[0].keys())}")

    timing_data = []
    for i in range(1, n_rounds + 1):
        module = f"EvalSeedAgentRound{i}"
        fn     = f"evalSeedAgentRound{i}"
        print(f"\nRound {i}/{n_rounds}:")
        round_start = time.perf_counter()
        ok = run_daml_script(
            args.container, args.dar,
            f"Scripts.{module}:{fn}",
            args.ledger_host, args.ledger_port,
        )
        round_duration = time.perf_counter() - round_start
        if not ok:
            print(f"  Skipping fetch for round {i} due to script failure.")
            rounds_data.append(dict(rounds_data[-1]))
            continue

        time.sleep(args.delay)
        print(f"  Fetching rankings after round {i} ... ", end="", flush=True)
        rd = fetch_rankings(args.url)
        scores = extract_scores(rd, args.role_type)
        rounds_data.append(scores)
        print("OK")

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

        num_events = count_round_events(args.daml_dir, i)
        avg_time_per_event = round_duration / num_events if num_events else float("nan")
        timing_data.append({
            "round": i,
            "duration_s": round_duration,
            "events": num_events,
            "avg_time_per_event_s": avg_time_per_event,
        })
        print(f"    Round time: {round_duration:.3f}s  |  events: {num_events}  |  "
              f"avg time/event: {avg_time_per_event:.3f}s")

    if timing_data:
        total_duration = sum(t["duration_s"] for t in timing_data)
        total_events = sum(t["events"] for t in timing_data)
        overall_avg = total_duration / total_events if total_events else float("nan")
        print("\n" + "─" * 72)
        print("Round timing summary")
        print("─" * 72)
        for t in timing_data:
            print(f"  Round {t['round']:>3}: {t['duration_s']:7.3f}s  "
                  f"events={t['events']:<3}  avg/event={t['avg_time_per_event_s']:.3f}s")
        print(f"  TOTAL: {total_duration:.3f}s over {total_events} events  "
              f"(avg {overall_avg:.3f}s/event)")

    all_agents = sorted({a for rd in rounds_data for a in rd})
    all_comps  = ["Reliability", "Responsiveness", "Accuracy"]

    round_labels = ["Prior"] + [f"TX-{i}" for i in range(1, n_rounds + 1)]

    print("\n" + "═" * 72)
    print("DATA block")
    print("═" * 72)
    print()
    print(f"# Each list: [{', '.join(round_labels)}]")
    print()
    print(build_data_block(rounds_data, all_agents, all_comps))
    print()
    print(f'ROUNDS = {round_labels}')
    print()

    if not args.no_plot:
        print("Generating reputation evolution plot ...")
        plot_reputation(rounds_data, all_agents, all_comps, round_labels,
                        WEIGHTS, output_path=args.plot_output)


if __name__ == "__main__":
    main()
