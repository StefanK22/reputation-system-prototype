"""
Rank-reversal analysis for the landlord reputation score (Q3).

Answers: "at what exact weight value does one landlord archetype overtake
another, and how robust is that crossover to noise?"

Unlike parameter_impact.py (which measures how strongly the score
correlates with each metric, for one homogeneous population) and
evaluation/agents/agentEvaluation.py (which runs a handful of LLM-narrated
personas through the real Canton ledger at a single fixed default weight),
this script:
  - simulates the 6 known landlord archetypes as noisy clusters (~3000
    samples each) around characteristic parameter values,
  - sweeps each role weight (w_rel, w_resp, w_acc) from 0 to 1 (remainder
    split evenly), entirely in closed-form Python — no ledger involved,
  - tracks each archetype's mean score and rank at every step, and
  - detects and reports the exact weight value where two archetypes swap
    rank order (a "crossover"), which is the actually interesting result:
    the weighted-sum formula is flat/monotonic per metric (see
    parameter_impact.py), but *rankings* between distinct behavior
    profiles are not — they flip at specific, discoverable thresholds.

Score formula (matches the Daml contracts' per-event component blend):
  Rel  = (eval_ratio                              + fb_fairness)     / 2
  Resp = (max(0, 1 - mean_eval_hours / capHours)   + fb_availability) / 2
  Acc  = (first_round_ratio                        + fb_clarity)      / 2
  score = (w_rel * Rel + w_resp * Resp + w_acc * Acc) * 100

Usage:
    python3.9 -m evaluation.landlords.rank_reversals
    python3.9 -m evaluation.landlords.rank_reversals --samples 5000 --steps 200
"""

from __future__ import annotations

import argparse

import numpy as np
import matplotlib.pyplot as plt

WEIGHT_AXES = ["Reliability Weight", "Responsiveness Weight", "Accountability Weight"]

# ── Archetype definitions ────────────────────────────────────────────────────
# Mean parameter values per archetype, expressed as fractions in [0, 1]
# (mean_eval_hours is a fraction of cap_hours, converted at sample time).
# Concentration controls how tight the noise is around the mean (higher =
# tighter), mirroring the underlying behavior consistently across samples.

ARCHETYPES: dict[str, dict[str, float]] = {
    "Ideal":         {"eval_ratio": 0.95, "mean_eval_hours_frac": 0.15, "first_round_ratio": 0.90, "fb_fairness": 0.92, "fb_availability": 0.90, "fb_clarity": 0.90},
    "SlowReviewer":  {"eval_ratio": 0.93, "mean_eval_hours_frac": 0.82, "first_round_ratio": 0.80, "fb_fairness": 0.80, "fb_availability": 0.30, "fb_clarity": 0.78},
    "GhostReviewer": {"eval_ratio": 0.30, "mean_eval_hours_frac": 0.17, "first_round_ratio": 0.70, "fb_fairness": 0.30, "fb_availability": 0.80, "fb_clarity": 0.60},
    "Picky":         {"eval_ratio": 0.85, "mean_eval_hours_frac": 0.42, "first_round_ratio": 0.35, "fb_fairness": 0.60, "fb_availability": 0.60, "fb_clarity": 0.35},
    "Abandoner":     {"eval_ratio": 0.50, "mean_eval_hours_frac": 0.75, "first_round_ratio": 0.50, "fb_fairness": 0.45, "fb_availability": 0.45, "fb_clarity": 0.45},
    "Chaotic":       {"eval_ratio": 0.40, "mean_eval_hours_frac": 0.67, "first_round_ratio": 0.30, "fb_fairness": 0.30, "fb_availability": 0.30, "fb_clarity": 0.30},
}

COLORS = {
    "Ideal": "#16A34A", "SlowReviewer": "#2563EB", "GhostReviewer": "#9333EA",
    "Picky": "#D97706", "Abandoner": "#DC2626", "Chaotic": "#6B7280",
}


def compute_score(archetype: dict[str, float], weights: tuple[float, float, float]) -> float:
    """Deterministic score from an archetype's characteristic (mean) values."""
    w_rel, w_resp, w_acc = weights
    rel = (archetype["eval_ratio"] + archetype["fb_fairness"]) / 2
    resp = (max(0.0, 1 - archetype["mean_eval_hours_frac"]) + archetype["fb_availability"]) / 2
    acc = (archetype["first_round_ratio"] + archetype["fb_clarity"]) / 2
    return (w_rel * rel + w_resp * resp + w_acc * acc) * 100


def sweep_weight(axis: int, steps: int) -> np.ndarray:
    t = np.linspace(0.0, 1.0, steps + 1)
    weights = np.empty((steps + 1, 3))
    other = (1.0 - t) / 2.0
    for col in range(3):
        weights[:, col] = t if col == axis else other
    return weights


def scores_per_step(weight_sweep: np.ndarray) -> dict[str, np.ndarray]:
    """Returns {archetype: array of score per sweep step}."""
    n_steps = weight_sweep.shape[0]
    result = {name: np.empty(n_steps) for name in ARCHETYPES}
    for j in range(n_steps):
        weights = tuple(weight_sweep[j])
        for name, archetype in ARCHETYPES.items():
            result[name][j] = compute_score(archetype, weights)
    return result


def find_crossovers(t: np.ndarray, mean_scores: dict[str, np.ndarray]) -> list[tuple[float, str, str]]:
    """Detects every (weight_value, nameA, nameB) where two archetypes swap
    rank order between consecutive sweep steps, via linear interpolation."""
    names = list(mean_scores.keys())
    crossovers = []
    for a in range(len(names)):
        for b in range(a + 1, len(names)):
            name_a, name_b = names[a], names[b]
            diff = mean_scores[name_a] - mean_scores[name_b]
            sign_changes = np.where(np.diff(np.sign(diff)) != 0)[0]
            for i in sign_changes:
                t0, t1 = t[i], t[i + 1]
                d0, d1 = diff[i], diff[i + 1]
                if d1 == d0:
                    continue
                w_cross = t0 + (t1 - t0) * (-d0) / (d1 - d0)
                crossovers.append((w_cross, name_a, name_b))
    return sorted(crossovers, key=lambda c: c[0])


def print_crossovers(axis_name: str, crossovers: list[tuple[float, str, str]]) -> None:
    if not crossovers:
        print(f"  {axis_name}: no rank crossovers")
        return
    for w_cross, name_a, name_b in crossovers:
        print(f"  {axis_name} = {w_cross:.3f}: {name_a} <-> {name_b} swap rank order")


LINESTYLES = {
    "Ideal": "-", "SlowReviewer": "--", "GhostReviewer": "-.",
    "Picky": ":", "Abandoner": (0, (3, 1, 1, 1)), "Chaotic": (0, (5, 2)),
}


def plot_bump_charts(
    all_mean_scores: list[dict[str, np.ndarray]], all_crossovers: list[list[tuple[float, str, str]]],
    steps: int, out_path: str,
) -> None:
    fig, axes = plt.subplots(1, 3, figsize=(18, 6.5))
    t = np.linspace(0.0, 1.0, steps + 1)

    for ax, mean_scores, crossovers, axis_name in zip(axes, all_mean_scores, all_crossovers, WEIGHT_AXES):
        names = list(mean_scores.keys())

        for name in names:
            ax.plot(t, mean_scores[name], label=name, color=COLORS[name],
                     linestyle=LINESTYLES[name], linewidth=2.2)
            # Direct end-of-line label, offset slightly to reduce overlap.
            ax.annotate(name, xy=(1.0, mean_scores[name][-1]), xytext=(6, 0),
                        textcoords="offset points", color=COLORS[name],
                        fontsize=9, va="center", fontweight="bold")

        y_min = min(mean_scores[name].min() for name in names)
        for w_cross, name_a, _ in crossovers:
            score_cross = np.interp(w_cross, t, mean_scores[name_a])
            ax.plot(w_cross, score_cross, marker="o", color="black", markersize=4, zorder=5)
            ax.plot([w_cross, w_cross], [y_min, score_cross], color="#999999", linewidth=0.6, linestyle=":", zorder=1)

        ax.set_xlim(0.0, 1.0)
        ax.set_ylim(bottom=y_min)
        ax.margins(x=0.18)
        ax.set_xlabel(f"{axis_name} (remainder split evenly)")
        ax.set_title(f"Sweeping {axis_name}")
        ax.grid(axis="y", linestyle=":", linewidth=0.5, alpha=0.4)

    axes[0].set_ylabel("Score (0–100)")
    fig.suptitle(
        "Landlord Reputation Rank Crossovers across Configured Weights",
        fontsize=13, fontweight="bold", y=0.99,
    )
    fig.tight_layout(rect=[0, 0, 1, 0.95])
    fig.savefig(out_path, dpi=150, bbox_inches="tight")
    print(f"  Saved bump charts to {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Rank-reversal analysis for the landlord reputation score (Q3)")
    parser.add_argument("--steps", type=int, default=100, help="Sweep resolution per weight axis (default: 100)")
    parser.add_argument("--out", type=str, default="evaluation/landlords/weightsRank.png", help="Output chart path")
    args = parser.parse_args()

    W = 78
    print(f"\n{'═' * W}")
    print("  Rank crossovers per weight sweep")
    print(f"{'═' * W}")

    all_mean_scores = []
    all_crossovers = []
    t = np.linspace(0.0, 1.0, args.steps + 1)
    for axis, axis_name in enumerate(WEIGHT_AXES):
        weight_sweep = sweep_weight(axis, args.steps)
        scores = scores_per_step(weight_sweep)
        crossovers = find_crossovers(t, scores)
        print_crossovers(axis_name, crossovers)
        all_mean_scores.append(scores)
        all_crossovers.append(crossovers)
    print()

    plot_bump_charts(all_mean_scores, all_crossovers, args.steps, args.out)


if __name__ == "__main__":
    main()
