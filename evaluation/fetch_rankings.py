#!/usr/bin/env python3
"""
Fetch agent reputation scores from the reputation engine REST API.
Usage: python fetch_rankings.py [--url http://localhost:8080]
"""

import argparse
import json
import urllib.request

def fetch_rankings(base_url: str) -> list:
    url = f"{base_url}/rankings"
    with urllib.request.urlopen(url) as response:
        return json.loads(response.read())

def short_name(party: str) -> str:
    """Strip the Canton party hash suffix — keep only the human-readable name."""
    return party.split("::")[0]

def print_agents(data: list) -> None:
    agents = [p for p in data if p.get("roleType") == "Agent"]

    if not agents:
        print("No agents found in response.")
        return

    print(f"\n{'Agent':<22} {'Overall':>8}   {'Reliability':>12} {'Responsiveness':>15} {'Accuracy':>9}")
    print("-" * 72)

    for subject in agents:
        name    = short_name(subject["party"])
        overall = subject["overallScore"]

        components = {c["componentId"]: c for c in subject["components"]}
        rel  = components.get("Reliability",    {})
        resp = components.get("Responsiveness", {})
        acc  = components.get("Accuracy",       {})

        def fmt(c):
            if not c:
                return "   n/a"
            return f"{c['score']:>5.1f} (w={c['weight']})"

        print(f"{name:<22} {overall:>8.1f}   {fmt(rel)}  {fmt(resp)}  {fmt(acc)}")

    print()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8080", help="Base URL of the reputation engine")
    args = parser.parse_args()

    data = fetch_rankings(args.url)
    print_agents(data)
