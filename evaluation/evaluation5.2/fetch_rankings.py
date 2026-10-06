#!/usr/bin/env python3
"""Run Test3 repetitions and analyze saved stabilization data."""

import argparse
import json
import os
import statistics
import subprocess
import time
import urllib.request


REPETITIONS = 30
ROUNDS = 25
TOLERANCES = (1, 2, 5, 10)
AGENTS = ("AgentPro", "AgentHighReject", "AgentSlowUploader", "AgentUnreliable")
COMPONENTS = ("Reliability", "Responsiveness", "Accuracy")
API_URL = "http://localhost:8080/rankings"
DAML_MODULE = "Scripts.Evaluation.Test3.Repetitions"


def fetch_agents():
    with urllib.request.urlopen(API_URL, timeout=10) as response:
        rankings = json.loads(response.read())

    agents = {}
    for subject in rankings:
        name = subject["party"].split("::")[0]
        if subject["roleType"] != "Agent" or name not in AGENTS:
            continue
        components = {component["componentId"]: component for component in subject["components"]}
        agents[name] = {
            "overall": subject["overallScore"],
            "scores": {component: components[component]["score"] for component in COMPONENTS},
            "counts": {component: components[component]["count"] for component in COMPONENTS},
        }
    return agents


def wait_for_api():
    print("  Waiting for the Reputation Engine...", flush=True)
    deadline = time.time() + 180
    while time.time() < deadline:
        try:
            fetch_agents()
            print("  Reputation Engine is ready.", flush=True)
            return
        except OSError:
            print("    Still starting; retrying in 2 seconds...", flush=True)
            time.sleep(2)
    raise RuntimeError("Timed out waiting for the Reputation Engine to start")


def wait_for_agents(expected_count):
    print(f"    Waiting for observation count {expected_count}...", flush=True)
    deadline = time.time() + 180
    previous_counts = None
    while time.time() < deadline:
        agents = fetch_agents()
        current_counts = {
            agent: min(agents[agent]["counts"].values())
            for agent in AGENTS
            if agent in agents
        }
        if current_counts != previous_counts:
            status = ", ".join(
                f"{agent}={current_counts.get(agent, 0)}" for agent in AGENTS
            )
            print(f"      Processed observations: {status}", flush=True)
            previous_counts = current_counts
        if set(agents) == set(AGENTS) and all(
            agents[agent]["counts"][component] >= expected_count
            for agent in AGENTS
            for component in COMPONENTS
        ):
            print("      Reputation Engine is up to date.", flush=True)
            return agents
        time.sleep(2)
    raise RuntimeError("Timed out waiting for the Reputation Engine to process the observations")


def run_daml(script_name):
    print(f"    Running {script_name}...", flush=True)
    started = time.time()
    process = subprocess.Popen(
        [
            "docker", "exec", "canton-sandbox", "daml", "script",
            "--dar", "/app/daml/.daml/dist/reputation-0.0.1.dar",
            "--script-name", script_name,
            "--ledger-host", "localhost",
            "--ledger-port", "6865",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    while True:
        try:
            _, stderr = process.communicate(timeout=5)
            break
        except subprocess.TimeoutExpired:
            print(f"      Still running ({time.time() - started:.0f}s)...", flush=True)
    if process.returncode != 0:
        raise RuntimeError(stderr.strip())
    print(f"      Daml script completed in {time.time() - started:.1f}s.", flush=True)


def stabilization_round(rounds, agent, tolerance):
    final_score = rounds[-1]["agents"][agent]["overall"]
    return next(
        rounds[index]["round"]
        for index in range(1, len(rounds))
        if all(
            abs(entry["agents"][agent]["overall"] - final_score) <= tolerance
            for entry in rounds[index:]
        )
    )


def print_repetition_stabilization(rounds, run_number):
    print(f"\nRepetition {run_number} stabilization rounds")
    print("Agent                    " + "    ".join(f"±{value}" for value in TOLERANCES))
    print("-" * (25 + 7 * len(TOLERANCES)))
    for agent in AGENTS:
        values = [stabilization_round(rounds, agent, tolerance) for tolerance in TOLERANCES]
        print(f"{agent:<24} " + "    ".join(f"{value:>3}" for value in values))


def show_reputation_evolution(rounds, run_number, output_path=None):
    import matplotlib.lines as mlines
    import matplotlib.ticker as mticker
    import matplotlib.pyplot as plt

    colors = {
        "AgentPro": "#2563EB",
        "AgentHighReject": "#7C3AED",
        "AgentSlowUploader": "#059669",
        "AgentUnreliable": "#DC2626",
    }
    styles = {
        "AgentPro": {"linestyle": "-", "marker": "o"},
        "AgentHighReject": {"linestyle": "--", "marker": "s"},
        "AgentSlowUploader": {"linestyle": "-.", "marker": "^"},
        "AgentUnreliable": {"linestyle": ":", "marker": "D"},
    }
    panels = COMPONENTS + ("Overall",)
    round_labels = ["Prior" if entry["round"] == 0 else f"TX-{entry['round']}" for entry in rounds]
    positions = list(range(len(rounds)))
    figure, axes = plt.subplots(2, 2, figsize=(20, 13.5))

    for axis, panel in zip(axes.flatten(), panels):
        for agent in AGENTS:
            if panel == "Overall":
                values = [entry["agents"][agent]["overall"] for entry in rounds]
            else:
                values = [entry["agents"][agent]["scores"][panel] for entry in rounds]
            axis.plot(
                positions,
                values,
                color=colors[agent],
                linewidth=2,
                markersize=5,
                **styles[agent],
            )

        axis.axhline(50, color="#9CA3AF", linestyle="--", linewidth=0.9, alpha=0.7)
        if panel == "Overall":
            axis.set_title(
                "Overall  (Reli×0.5 + Resp×0.3 + Accu×0.2)",
                fontsize=19,
                fontweight="bold",
            )
        else:
            axis.set_title(panel, fontsize=19, fontweight="bold")

        shown = list(range(0, len(rounds), max(1, (len(rounds) - 1) // 10)))
        if len(rounds) - 1 not in shown:
            shown.append(len(rounds) - 1)
        axis.set_xticks(shown)
        axis.set_xticklabels(
            [round_labels[index] for index in shown],
            fontsize=16,
            rotation=45,
            ha="right",
        )
        axis.set_xlim(-0.4, len(rounds) - 0.6)
        axis.set_ylim(0, 100)
        axis.set_ylabel("Score (0-100)", fontsize=18)
        axis.tick_params(axis="y", labelsize=16)
        axis.yaxis.set_major_locator(mticker.MultipleLocator(20))
        axis.grid(axis="y", linestyle="--", linewidth=0.5, alpha=0.4)
        axis.spines["top"].set_visible(False)
        axis.spines["right"].set_visible(False)

    legend_handles = [
        mlines.Line2D(
            [0],
            [0],
            color=colors[agent],
            label=agent,
            linewidth=2,
            markersize=5,
            **styles[agent],
        )
        for agent in AGENTS
    ]
    legend_handles.append(
        mlines.Line2D(
            [0],
            [0],
            color="#9CA3AF",
            linestyle="--",
            linewidth=0.9,
            label="Prior (50)",
        )
    )
    figure.legend(
        handles=legend_handles,
        loc="lower center",
        ncol=5,
        fontsize=20,
        frameon=False,
        bbox_to_anchor=(0.5, 0),
    )
    figure.suptitle(
        f"Agent Reputation Evolution across Interactions",
        fontsize=27,
        fontweight="bold",
        y=0.99,
    )
    figure.tight_layout(rect=[0, 0.1, 1, 0.95])
    if output_path:
        figure.savefig(output_path, dpi=180, bbox_inches="tight")
    else:
        plt.show()
    plt.close(figure)


def analyze_all_repetitions(results_directory, show_figure):
    missing_results = [
        f"run_{number:02d}.json"
        for number in range(1, REPETITIONS + 1)
        if not os.path.exists(os.path.join(results_directory, f"run_{number:02d}.json"))
    ]
    if missing_results:
        raise ValueError("missing saved repetitions: " + ", ".join(missing_results))

    saved_runs = []
    for number in range(1, REPETITIONS + 1):
        path = os.path.join(results_directory, f"run_{number:02d}.json")
        with open(path) as result_file:
            saved_runs.append(json.load(result_file)["rounds"])

    means = {agent: {} for agent in AGENTS}
    deviations = {agent: {} for agent in AGENTS}
    final_means = {}
    final_deviations = {}
    for agent in AGENTS:
        final_scores = [saved_run[-1]["agents"][agent]["overall"] for saved_run in saved_runs]
        final_means[agent] = statistics.mean(final_scores)
        final_deviations[agent] = statistics.stdev(final_scores)
        for tolerance in TOLERANCES:
            values = [
                stabilization_round(saved_run, agent, tolerance)
                for saved_run in saved_runs
            ]
            means[agent][tolerance] = statistics.mean(values)
            deviations[agent][tolerance] = statistics.stdev(values)

    print(f"\nTest3 summary across {REPETITIONS} repetitions")
    print("Final reputation is the round-25 overall score; ± columns are stabilization rounds.")
    print("Values are mean ± sample SD.")
    print(
        f"{'Agent':<24}{'Final reputation':>18}"
        + "".join(f"{f'±{value} points':>18}" for value in TOLERANCES)
    )
    print("-" * (42 + 18 * len(TOLERANCES)))
    for agent in AGENTS:
        cells = [f"{final_means[agent]:.2f} ± {final_deviations[agent]:.2f}"] + [
            f"{means[agent][tolerance]:.2f} ± {deviations[agent][tolerance]:.2f}"
            for tolerance in TOLERANCES
        ]
        print(f"{agent:<24}" + "".join(f"{cell:>18}" for cell in cells))

    if not show_figure:
        import matplotlib

        matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    positions = list(range(len(AGENTS)))
    width = 0.18
    figure, axis = plt.subplots(figsize=(11, 6))
    for index, tolerance in enumerate(TOLERANCES):
        axis.bar(
            [
                position + (index - (len(TOLERANCES) - 1) / 2) * width
                for position in positions
            ],
            [means[agent][tolerance] for agent in AGENTS],
            width,
            yerr=[deviations[agent][tolerance] for agent in AGENTS],
            capsize=4,
            label=f"±{tolerance} points",
        )
    axis.set_title(f"Test3 Stabilization Time across {REPETITIONS} Repetitions")
    axis.set_ylabel("Mean stabilization round (error bars: sample SD)")
    axis.set_xticks(positions)
    axis.set_xticklabels(AGENTS)
    axis.set_ylim(bottom=0)
    axis.grid(axis="y", alpha=0.2)
    axis.legend(frameon=False)
    figure.tight_layout()

    figure_path = os.path.join(results_directory, "stabilization.png")
    figure.savefig(figure_path, dpi=150, bbox_inches="tight")
    print(f"Saved {figure_path}")
    if show_figure and "agg" not in plt.get_backend().lower():
        plt.show()
    plt.close(figure)


def main():
    parser = argparse.ArgumentParser(description="Run or analyze Test3 repetitions")
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument(
        "--repetition",
        type=int,
        help="Repetition to evaluate (1-30)",
    )
    selection.add_argument(
        "--analyze-all",
        action="store_true",
        help="Analyze all 30 saved repetitions without running Daml",
    )
    parser.add_argument(
        "--analyze-only",
        action="store_true",
        help="Show stabilization and reputation evolution from a saved repetition",
    )
    args = parser.parse_args()

    test_directory = os.path.dirname(os.path.abspath(__file__))
    results_directory = os.path.join(test_directory, "repetitions")

    if args.analyze_all:
        if args.analyze_only:
            parser.error("--analyze-only can only be used with --repetition")
        try:
            analyze_all_repetitions(results_directory, show_figure=True)
        except ValueError as error:
            parser.error(str(error))
        return

    if not 1 <= args.repetition <= REPETITIONS:
        parser.error(f"--repetition must be between 1 and {REPETITIONS}")

    run_number = args.repetition
    result_path = os.path.join(results_directory, f"run_{run_number:02d}.json")

    if args.analyze_only:
        if not os.path.exists(result_path):
            parser.error(f"saved repetition not found: {result_path}")
        with open(result_path) as result_file:
            rounds = json.load(result_file)["rounds"]
        print_repetition_stabilization(rounds, run_number)
        show_reputation_evolution(rounds, run_number)
        return

    print(f"Test3 repetition {run_number}/{REPETITIONS}")
    wait_for_api()
    print("  Running setup")
    repetition_module = f"{DAML_MODULE}.Repetition{run_number:02d}"
    run_daml(f"{repetition_module}.EvalSeedAgentSetup:evalSeedAgentSetup")
    rounds = [{"round": 0, "agents": wait_for_agents(0)}]
    print("  Setup processed; initial scores captured.")

    for round_number in range(1, ROUNDS + 1):
        print(f"  Round {round_number}/{ROUNDS}")
        run_daml(
            f"{repetition_module}.EvalSeedAgentRound{round_number}:"
            f"evalSeedAgentRound{round_number}"
        )
        agents = wait_for_agents(round_number * 2)
        rounds.append({"round": round_number, "agents": agents})
        print(
            "    " + ", ".join(
                f"{agent}={agents[agent]['overall']:.1f}" for agent in AGENTS
            )
        )

    print("\nSaving completed repetition...", flush=True)
    os.makedirs(results_directory, exist_ok=True)
    with open(result_path, "w") as result_file:
        json.dump({"run": run_number, "rounds": rounds}, result_file, indent=2)
        result_file.write("\n")
    print(f"Saved {result_path}")
    print_repetition_stabilization(rounds, run_number)

    missing_runs = [
        number
        for number in range(1, REPETITIONS + 1)
        if not os.path.exists(os.path.join(results_directory, f"run_{number:02d}.json"))
    ]
    if missing_runs:
        print(f"Saved repetition {run_number}; {len(missing_runs)} repetitions remain.")
        print("Run 'docker compose down' before starting the next repetition.")
        return

    print("\nAll repetitions collected; calculating stabilization statistics...")
    analyze_all_repetitions(results_directory, show_figure=False)
    print("Test3 evaluation complete.")


if __name__ == "__main__":
    main()
