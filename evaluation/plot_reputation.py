#!/usr/bin/env python3
"""
Plot agent reputation evolution across interactions.
Data sourced from results.txt (rounds 0–4).

Usage:
    python plot_reputation.py

Output:
    reputation_evolution.png
"""

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import matplotlib.lines as mlines
import numpy as np

# ── Data extracted from results.txt ──────────────────────────────────────────
# Each list: [Prior (count=0), TX-1 (count=2), TX-2 (count=4), TX-3 (count=6), TX-4 (count=8)]

DATA = {
    "AgentHighReject": {
        "Reliability": [75, 85, 86, 87, 87, 85, 82, 82, 82, 82, 82, 83, 82, 82, 82, 83, 83, 83, 83, 82, 82, 82, 82, 82, 82, 81],
        "Responsiveness": [75, 89, 84, 86, 86, 84, 86, 85, 86, 87, 86, 86, 86, 86, 85, 84, 84, 84, 83, 83, 83, 83, 82, 81, 81, 81],
        "Accuracy": [75, 48, 42, 40, 39, 38, 38, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36, 36],
    },
    "AgentPro": {
        "Reliability": [75, 92, 95, 96, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97, 97],
        "Responsiveness": [75, 89, 84, 86, 84, 83, 85, 84, 85, 86, 85, 86, 86, 86, 85, 84, 84, 84, 83, 83, 83, 82, 81, 80, 80, 80],
        "Accuracy": [75, 92, 69, 78, 74, 79, 82, 76, 79, 81, 83, 85, 87, 88, 86, 82, 84, 84, 83, 83, 83, 82, 80, 78, 78, 78],
    },
    "AgentSlowUploader": {
        "Reliability": [75, 70, 71, 71, 71, 70, 69, 68, 67, 66, 66, 67, 67, 67, 67, 67, 67, 66, 66, 66, 66, 67, 67, 67, 67, 67],
        "Responsiveness": [75, 34, 22, 21, 18, 15, 16, 15, 16, 16, 15, 16, 15, 16, 15, 14, 15, 16, 16, 17, 17, 17, 17, 17, 17, 17],
        "Accuracy": [75, 92, 81, 86, 81, 85, 87, 80, 82, 84, 85, 86, 88, 88, 87, 83, 84, 84, 84, 84, 84, 83, 82, 80, 80, 80],
    },
    "AgentUnreliable": {
        "Reliability": [75, 36, 35, 25, 23, 24, 23, 21, 21, 21, 20, 19, 19, 18, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16],
        "Responsiveness": [75, 88, 89, 89, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
        "Accuracy": [75, 90, 76, 76, 65, 64, 64, 60, 65, 62, 60, 63, 62, 63, 64, 62, 64, 66, 66, 68, 70, 68, 66, 65, 66, 66],
    },
}

WEIGHTS = {"Reliability": 0.5, "Responsiveness": 0.3, "Accuracy": 0.2}

_n = len(next(iter(next(iter(DATA.values())).values())))
ROUNDS = ["Prior"] + [f"TX-{i}" for i in range(1, _n)]
X      = np.arange(_n)
AGENTS = list(DATA.keys())

# Compute weighted overall score for each agent at each round
for agent in AGENTS:
    DATA[agent]["Overall"] = [
        round(sum(WEIGHTS[c] * DATA[agent][c][i] for c in WEIGHTS), 1)
        for i in range(len(ROUNDS))
    ]

# ── Visual style ──────────────────────────────────────────────────────────────
COLORS = {
    "AgentPro":          "#2563EB",   # blue
    "AgentSlowUploader": "#D97706",   # amber
    "AgentHighReject":   "#7C3AED",   # purple
    "AgentUnreliable":   "#DC2626",   # red
}
LINE_STYLES = {
    "AgentPro":          dict(linestyle="-",  linewidth=2.0, marker="o", markersize=5),
    "AgentSlowUploader": dict(linestyle="--", linewidth=2.0, marker="s", markersize=5),
    "AgentHighReject":   dict(linestyle="-.", linewidth=2.0, marker="^", markersize=5),
    "AgentUnreliable":   dict(linestyle=":",  linewidth=2.2, marker="D", markersize=5),
}


# ── Figure ────────────────────────────────────────────────────────────────────
COMPONENTS = ["Reliability", "Responsiveness", "Accuracy", "Overall"]

fig, axes = plt.subplots(2, 2, figsize=(16, 10))
axes = axes.flatten()

for ax, comp in zip(axes, COMPONENTS):
    for agent in AGENTS:
        values = DATA[agent][comp]
        ax.plot(X, values, color=COLORS[agent], **LINE_STYLES[agent], zorder=3)

    # Dashed reference line at the starting prior (75)
    ax.axhline(
        75, color="#9CA3AF", linestyle="--",
        linewidth=0.9, zorder=1, alpha=0.7, label="_nolegend_"
    )

    # Panel title
    if comp == "Overall":
        ax.set_title("Overall  (Rel×0.5 + Resp×0.3 + Acc×0.2)", fontsize=10, fontweight="bold", pad=6)
    else:
        ax.set_title(comp, fontsize=10, fontweight="bold", pad=6)

    step = max(1, (_n - 1) // 10)
    shown = list(range(0, _n, step))
    if (_n - 1) not in shown:
        shown.append(_n - 1)
    ax.set_xticks(shown)
    ax.set_xticklabels([ROUNDS[i] for i in shown], fontsize=8, rotation=45, ha="right")
    ax.set_xlim(-0.4, _n - 0.6)
    ax.set_ylim(0, 100)
    ax.set_ylabel("Score (0–100)", fontsize=9)
    ax.yaxis.set_major_locator(mticker.MultipleLocator(20))
    ax.grid(axis="y", linestyle="--", linewidth=0.5, alpha=0.4, zorder=0)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

# Shared legend at the bottom
legend_handles = [
    mlines.Line2D([0], [0], color=COLORS[a], label=a, **LINE_STYLES[a])
    for a in AGENTS
]
legend_handles.append(
    mlines.Line2D([0], [0], color="#9CA3AF", linestyle="--", linewidth=0.9, label="Prior (75)")
)
fig.legend(
    handles=legend_handles,
    loc="lower center",
    ncol=5,
    fontsize=9,
    frameon=False,
    bbox_to_anchor=(0.5, 0.0),
)

fig.suptitle(
    "Agent Reputation Evolution across Interactions",
    fontsize=13, fontweight="bold", y=0.99,
)

plt.tight_layout(rect=[0, 0.06, 1, 0.97])
plt.savefig("reputation_evolution.png", dpi=150, bbox_inches="tight")
plt.show()
