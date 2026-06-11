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
    "AgentPro": {
        "Reliability":    [50, 83, 89, 92, 94],
        "Responsiveness": [50, 81, 84, 86, 85],
        "Accuracy":       [50, 83, 75, 82, 77],
    },
    "AgentSlowUploader": {
        "Reliability":    [50, 60, 61, 65, 65],
        "Responsiveness": [50, 29, 19, 19, 17],
        "Accuracy":       [50, 83, 74, 80, 75],
    },
    "AgentHighReject": {
        "Reliability":    [50, 73, 77, 80, 82],
        "Responsiveness": [50, 78, 77, 82, 82],
        "Accuracy":       [50, 40, 33, 33, 30],
    },
    "AgentUnreliable": {
        "Reliability":    [50, 40, 24, 22, 21],
        "Responsiveness": [50, 73, 85, 87, 89],
        "Accuracy":       [50, 75, 63, 73, 69],
    },
}

WEIGHTS = {"Reliability": 0.5, "Responsiveness": 0.3, "Accuracy": 0.2}
ROUNDS   = ["Prior", "TX-1", "TX-2", "TX-3", "TX-4"]
X        = np.arange(len(ROUNDS))
AGENTS   = list(DATA.keys())

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

fig, axes = plt.subplots(2, 2, figsize=(13, 9))
axes = axes.flatten()

for ax, comp in zip(axes, COMPONENTS):
    for agent in AGENTS:
        values = DATA[agent][comp]
        ax.plot(X, values, color=COLORS[agent], **LINE_STYLES[agent], zorder=3)

    # Dashed reference line at the starting prior (50)
    ax.axhline(
        50, color="#9CA3AF", linestyle="--",
        linewidth=0.9, zorder=1, alpha=0.7, label="_nolegend_"
    )

    # Panel title
    if comp == "Overall":
        ax.set_title("Overall  (Rel×0.5 + Resp×0.3 + Acc×0.2)", fontsize=10, fontweight="bold", pad=6)
    else:
        ax.set_title(comp, fontsize=10, fontweight="bold", pad=6)

    ax.set_xticks(X)
    ax.set_xticklabels(ROUNDS, fontsize=9)
    ax.set_xlim(-0.4, len(ROUNDS) - 0.6)
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
    mlines.Line2D([0], [0], color="#9CA3AF", linestyle="--", linewidth=0.9, label="Prior (50)")
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
