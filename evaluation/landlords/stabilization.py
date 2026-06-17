"""
Score-stabilization analysis for the landlord reputation score (Option B).

Simulates the literal running-average update from REPUTATION_ALGORITHM.md
Phase B, interaction by interaction, for each of the 6 landlord archetypes
defined in weightsRank.py:

    step  = 1 / (count + 2)
    score = score + step * (observedValue - score)

and asks: how many interactions does it take for the OVERALL score to stop
moving? Unlike weightsRank.py (which answers "where do archetypes cross
ranks as weights change" via a static cross-sectional sweep), this script
runs each archetype forward in time and watches its own score trajectory.

Crucially, "stabilized" is defined using only the score's own recent
volatility -- NOT distance from the archetype's true mean -- because on the
real system you never know a landlord's true mean in advance. Concretely:

    stabilized at round n  <=>  the trailing window of the last
    --window rounds has max-min range below --epsilon, AND this holds for
    every later round too (no late-run wobble counts as false convergence).

Usage:
    python3.9 -m evaluation.landlords.stabilization
    python3.9 -m evaluation.landlords.stabilization --trials 5000 --rounds 400
"""

from __future__ import annotations

import argparse

import numpy as np
import matplotlib.pyplot as plt

from evaluation.landlords.weightsRank import ARCHETYPES, COLORS

# Matches landlordWeights in EvalSeedAgentSetup.daml.
LANDLORD_WEIGHTS = {"rel": 0.334, "resp": 0.333, "acc": 0.333}
START_VALUE = 50.0  # 0-100 display scale, matches RoleConfiguration.startValue

CONCENTRATION = 12.0  # higher = tighter noise around each archetype's mean


def _beta_around(mean: float, kappa: float, n: int, rng: np.random.Generator) -> np.ndarray:
    mean = min(max(mean, 1e-3), 1 - 1e-3)
    return rng.beta(mean * kappa, (1 - mean) * kappa, n)


def simulate_archetype(
    archetype: dict[str, float], trials: int, rounds: int, cap_hours: float, rng: np.random.Generator,
) -> np.ndarray:
    """Returns overall score trajectories, shape (trials, rounds)."""
    score_rel = np.full(trials, START_VALUE)
    score_resp = np.full(trials, START_VALUE)
    score_acc = np.full(trials, START_VALUE)
    count = 0

    overall = np.empty((trials, rounds))
    for i in range(rounds):
        eval_ratio = _beta_around(archetype["eval_ratio"], CONCENTRATION, trials, rng)
        mean_eval_hours = _beta_around(archetype["mean_eval_hours_frac"], CONCENTRATION, trials, rng) * cap_hours
        first_round_ratio = _beta_around(archetype["first_round_ratio"], CONCENTRATION, trials, rng)
        fb_fairness = _beta_around(archetype["fb_fairness"], CONCENTRATION, trials, rng)
        fb_availability = _beta_around(archetype["fb_availability"], CONCENTRATION, trials, rng)
        fb_clarity = _beta_around(archetype["fb_clarity"], CONCENTRATION, trials, rng)

        rel_obs = (eval_ratio + fb_fairness) / 2 * 100
        resp_obs = (np.clip(1 - mean_eval_hours / cap_hours, 0.0, None) + fb_availability) / 2 * 100
        acc_obs = (first_round_ratio + fb_clarity) / 2 * 100

        step = 1.0 / (count + 2)
        score_rel = score_rel + step * (rel_obs - score_rel)
        score_resp = score_resp + step * (resp_obs - score_resp)
        score_acc = score_acc + step * (acc_obs - score_acc)
        count += 1

        overall[:, i] = (
            LANDLORD_WEIGHTS["rel"] * score_rel
            + LANDLORD_WEIGHTS["resp"] * score_resp
            + LANDLORD_WEIGHTS["acc"] * score_acc
        )
    return overall


def stabilization_round(trajectory: np.ndarray, window: int, epsilon: float) -> float:
    """First round n such that the trailing `window`-round range stays below
    `epsilon` for every round from n onward. Returns np.nan if it never does."""
    rounds = trajectory.shape[0]
    if rounds < window:
        return np.nan
    rolling_max = np.array([trajectory[max(0, i - window + 1): i + 1].max() for i in range(rounds)])
    rolling_min = np.array([trajectory[max(0, i - window + 1): i + 1].min() for i in range(rounds)])
    stable_mask = (rolling_max - rolling_min) < epsilon
    stable_mask[:window - 1] = False  # not enough history yet
    # Find the earliest index after which stable_mask is True for the rest of the run.
    for i in range(rounds):
        if stable_mask[i:].all():
            return float(i + 1)  # 1-indexed round number
    return np.nan


def summarize(name: str, trajectories: np.ndarray, window: int, epsilon: float) -> dict:
    trials = trajectories.shape[0]
    rounds_to_stabilize = np.array([
        stabilization_round(trajectories[t], window, epsilon) for t in range(trials)
    ])
    converged = ~np.isnan(rounds_to_stabilize)
    pct_converged = converged.mean() * 100
    valid = rounds_to_stabilize[converged]
    return {
        "name": name,
        "mean": valid.mean() if valid.size else float("nan"),
        "median": np.median(valid) if valid.size else float("nan"),
        "p90": np.percentile(valid, 90) if valid.size else float("nan"),
        "pct_converged": pct_converged,
        "raw": rounds_to_stabilize,
    }


def print_summary(results: list[dict]) -> None:
    W = 78
    print(f"\n{'═' * W}")
    print("  Rounds to stabilize (trailing-window volatility, no ground truth used)")
    print(f"{'═' * W}")
    print(f"  {'Archetype':<16}{'mean':>8}{'median':>8}{'p90':>8}{'% converged':>14}")
    for r in results:
        print(f"  {r['name']:<16}{r['mean']:>8.1f}{r['median']:>8.1f}{r['p90']:>8.1f}{r['pct_converged']:>13.1f}%")
    print()


def plot_histograms(results: list[dict], rounds: int, window: int, epsilon: float, out_path: str) -> None:
    fig, axes = plt.subplots(2, 3, figsize=(16, 8), sharex=True, sharey=True)
    for ax, r in zip(axes.flat, results):
        valid = r["raw"][~np.isnan(r["raw"])]
        ax.hist(valid, bins=30, color=COLORS[r["name"]], alpha=0.85)
        ax.axvline(r["median"], color="black", linestyle="--", linewidth=1)
        ax.set_title(f"{r['name']} (median={r['median']:.0f}, {r['pct_converged']:.0f}% conv.)")
        ax.set_xlabel(f"rounds to stabilize (±{epsilon:.0f} pt over {window} rounds)")
    axes[0, 0].set_ylabel("trial count")
    fig.suptitle(
        f"Landlord Score Stabilization to within {epsilon:.0f} Score Point"
        f"{'s' if epsilon != 1 else ''} (cap={rounds} rounds simulated)",
        fontsize=13, fontweight="bold", y=0.99,
    )
    fig.tight_layout(rect=[0, 0, 1, 0.96])
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    print(f"  Saved histograms to {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Score-stabilization analysis for landlords")
    parser.add_argument("--trials", type=int, default=10000, help="Monte Carlo trials per archetype")
    parser.add_argument("--rounds", type=int, default=300, help="Interactions simulated per trial")
    parser.add_argument("--window", type=int, default=10, help="Trailing window size in rounds")
    parser.add_argument("--epsilon", type=float, default=1.0, help="Stability threshold in score points")
    parser.add_argument("--cap-hours", type=float, default=24.0, help="responsivenessCapHours")
    parser.add_argument("--seed", type=int, default=42, help="RNG seed")
    parser.add_argument("--out", type=str, default="evaluation/landlords/stabilization.png")
    args = parser.parse_args()

    rng = np.random.default_rng(args.seed)

    results = []
    for name, archetype in ARCHETYPES.items():
        trajectories = simulate_archetype(archetype, args.trials, args.rounds, args.cap_hours, rng)
        results.append(summarize(name, trajectories, args.window, args.epsilon))

    print_summary(results)
    plot_histograms(results, args.rounds, args.window, args.epsilon, args.out)


if __name__ == "__main__":
    main()
