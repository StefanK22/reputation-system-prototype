import argparse
import json
import os
from datetime import datetime, timedelta
from google import genai


# ─────────────────────────────────────────────────────────────────────────────
# Personality archetypes — character portraits, not operational scripts.
# Each archetype has ONE clearly weak dimension so scores are visibly separated.
# ─────────────────────────────────────────────────────────────────────────────

_AGENT_PRO = (
    "An elite real-estate agent who takes genuine pride in every transaction. "
    "Proposals are thorough, well-researched, and rarely need revision. "
    "Equally exceptional at the follow-through: once a deal is agreed, he moves swiftly "
    "on every post-approval step without needing to be chased. "
    "He never walks away from a deal. Communicates proactively and gives honest, "
    "thoughtful feedback about the people he works with."
)
# Expected: Reliability ~92 | Responsiveness ~84 | Accuracy ~92

_AGENT_SLOW_UPLOADER = (
    "A gifted negotiator and proposal writer whose work is meticulous and rarely rejected. "
    "However, once the exciting negotiation phase ends, his focus drifts. "
    "Administrative follow-through is his weakness — he tends to lose urgency after "
    "proposals are agreed and lets the contract stage drag on without explanation. "
    "Buyers feel abandoned once the deal is struck. Every transaction does eventually close, "
    "but not before significant frustration. Gives balanced, if uninspired, feedback."
)
# Expected: Reliability ~79 | Responsiveness ~12 | Accuracy ~91

_AGENT_HIGH_REJECT = (
    "A high-energy agent who thrives on fast turnarounds. Once a proposal is accepted, "
    "he moves immediately to get the contract signed. "
    "His weakness is preparation: he habitually submits proposals before they are truly "
    "ready. Buyers almost never accept without pushing back, and a single revision "
    "rarely satisfies — the correction usually reveals another gap. He handles each "
    "rejection professionally and corrects course, but the under-preparation recurs "
    "without fail. Every transaction eventually closes."
)
# Expected: Reliability ~77 | Responsiveness ~83 | Accuracy ~30

_AGENT_UNRELIABLE = (
    "An agent who enters transactions with genuine enthusiasm and handles the early stages "
    "capably — responsive during negotiation, reasonably diligent with proposals, "
    "and quick to upload the contract once a deal is agreed. "
    "But he has a troubling pattern of pulling out at the final stage, citing vague "
    "logistical complications or external pressures, leaving buyers without a closing. "
    "When he does follow through, the transaction is handled competently. "
    "Buyers who were abandoned feel his reliability and professionalism are unacceptable, "
    "even though he was fast and available throughout the process up to that point."
)
# Expected: Reliability ~40 | Responsiveness ~67 | Accuracy ~78

# ─────────────────────────────────────────────────────────────────────────────
# Buyer personality archetypes — each stresses a different dimension of agent
# performance. All four agents are paired with the same buyer per round so
# their scores are directly comparable within that round.
# ─────────────────────────────────────────────────────────────────────────────

_BUYER_IMPATIENT = (
    "A busy professional with a packed schedule and zero tolerance for wasted time. "
    "Responds almost immediately to every message and expects the same in return. "
    "Gets genuinely upset when the post-approval process stalls without explanation — "
    "will follow up aggressively and is vocal and specific in feedback. "
    "Values responsiveness above all else; a slow contract upload is unforgivable regardless "
    "of the agent's other qualities."
)
# Stresses: Responsiveness — AgentSlowUploader's weakness gets maximally penalised here.

_BUYER_DEMANDING = (
    "A high-standards buyer who scrutinises proposals in detail and is slow to respond — "
    "he takes his time before committing. Quick to reject anything that doesn't fully meet "
    "his expectations, and he anticipates several rounds before he is satisfied. "
    "Despite his own high demands and measured pace, he recognises and genuinely appreciates "
    "quality work when he sees it. Accuracy and thoroughness matter most to him."
)
# Stresses: Accuracy — AgentHighReject's habitual under-preparation is maximally punished here.

_BUYER_EAGER = (
    "An enthusiastic buyer with strong motivation and a tight personal timeline. "
    "Responds quickly, approves proposals readily, and is eager to reach the contract stage. "
    "Becomes noticeably impatient when momentum stalls after a proposal is agreed, "
    "but is generally positive and fair-minded. Provides honest, balanced feedback "
    "that reflects the full arc of the experience."
)
# Neutral / baseline — provides a clean signal for all four agents without extreme bias.

_BUYER_PERSISTENT = (
    "A determined buyer who works through setbacks methodically and without panic. "
    "Moderately responsive — not in a rush, but not passive either. "
    "Pushes back on proposals that don't meet his standards but keeps going until a deal is "
    "reached. His feedback reflects the complete experience: the effort required, what "
    "frustrated him, and what he genuinely appreciated along the way."
)
# Moderate stress — a fair but thorough observer who captures agent weaknesses clearly.

_BUYER_CAUTIOUS = (
    "A meticulous, risk-averse buyer who takes his time on every decision. "
    "He reads every document carefully and rarely responds in under 48 hours. "
    "Not unfriendly — just deliberate. He will ask many clarifying questions before "
    "approving a proposal and expects the agent to have patient, well-prepared answers. "
    "Once committed, he honours his word completely. "
    "His feedback is thorough and fair: he appreciates professionalism and punishes "
    "sloppiness, but does not penalise agents for the time he himself takes."
)
# Stresses: Agent patience over long timelines; accuracy and reliability clearly differentiated.

_BUYER_INVESTOR = (
    "A seasoned property investor who treats every transaction as a pure business decision. "
    "He moves fast, responds within the hour, and expects the same from everyone else. "
    "He scrutinises proposals rigorously — any inaccuracy signals amateurism — but once "
    "satisfied, he approves immediately and demands equally swift follow-through on contracts. "
    "He is equally unforgiving of slow uploads and poor proposal quality. "
    "His feedback is blunt, precise, and comprehensive: high marks only for agents who "
    "deliver on both speed and accuracy."
)
# Stresses: Both responsiveness AND accuracy simultaneously — double exposure for weak agents.

_BUYER_RELUCTANT = (
    "A hesitant buyer pushed into the market by external circumstances rather than genuine "
    "desire. He takes long pauses between responses and finds reasons to reject proposals "
    "even when they are technically adequate. He needs more rounds of back-and-forth than "
    "most buyers and may disengage for days without warning. Transactions do eventually "
    "close, but only with sustained effort from the agent. "
    "His feedback reflects his ambivalence: agents who kept him engaged and on track receive "
    "grudging respect; those who lost patience or let things slip receive sharp criticism."
)
# Stresses: Agent persistence and accuracy under repeated rejection cycles.

_BUYER_EXPERIENCED = (
    "A highly experienced buyer on his third or fourth property purchase. "
    "He knows exactly how the process should work and spots procedural missteps immediately. "
    "Responds promptly, approves clean proposals on first pass, and expects the contract "
    "stage to proceed without incident. "
    "If an agent meets his standards, he says so clearly and fairly. "
    "If they fall short — slow uploads, voided contracts, or excessive revisions — his "
    "written feedback is precise and unsparing. He is not harsh without cause, but the "
    "bar he holds is high and non-negotiable."
)
# Expected: Consistent, precise observer — clean signal because his own behaviour is predictable.

# ─────────────────────────────────────────────────────────────────────────────
# Agent and round definitions.
# _ROUNDS drives everything: 25 rounds, each with one buyer + one context.
# All four agents interact with the same buyer/context within a round.
# ─────────────────────────────────────────────────────────────────────────────

_AGENTS = [
    {"partyName": "AgentPro",          "personality": _AGENT_PRO},
    {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
    {"partyName": "AgentHighReject",   "personality": _AGENT_HIGH_REJECT},
    {"partyName": "AgentUnreliable",   "personality": _AGENT_UNRELIABLE},
]

_ROUNDS = [
    # ── Cycle A (rounds 1–5): Baseline — one buyer per dimension ────────────
    {
        "buyer_name": "BuyerImpatient",
        "buyer_personality": _BUYER_IMPATIENT,
        "context": "Standard mid-market residential sale in a stable suburban area.",
    },
    {
        "buyer_name": "BuyerDemanding",
        "buyer_personality": _BUYER_DEMANDING,
        "context": "Premium detached family home; buyer commissioning a full independent survey.",
    },
    {
        "buyer_name": "BuyerEager",
        "buyer_personality": _BUYER_EAGER,
        "context": "Modern apartment in a popular neighbourhood; buyer ready to move quickly.",
    },
    {
        "buyer_name": "BuyerPersistent",
        "buyer_personality": _BUYER_PERSISTENT,
        "context": "Semi-detached house in a competitive market with several competing offers.",
    },
    {
        "buyer_name": "BuyerCautious",
        "buyer_personality": _BUYER_CAUTIOUS,
        "context": "Rural property with a complex title history; buyer taking time to verify all details.",
    },

    # ── Cycle B (rounds 6–10): New archetypes introduced ────────────────────
    {
        "buyer_name": "BuyerInvestor",
        "buyer_personality": _BUYER_INVESTOR,
        "context": "City-centre buy-to-let apartment; buyer focused on rental yield and fast execution.",
    },
    {
        "buyer_name": "BuyerReluctant",
        "buyer_personality": _BUYER_RELUCTANT,
        "context": "Three-bedroom semi; buyer was persuaded by their spouse and is not fully committed.",
    },
    {
        "buyer_name": "BuyerExperienced",
        "buyer_personality": _BUYER_EXPERIENCED,
        "context": "Seasoned buyer on their third property purchase in five years; expects a smooth process.",
    },
    {
        "buyer_name": "BuyerImpatient",
        "buyer_personality": _BUYER_IMPATIENT,
        "context": "Hot market with a competing offer already on the table; every hour of delay risks losing the property.",
    },
    {
        "buyer_name": "BuyerDemanding",
        "buyer_personality": _BUYER_DEMANDING,
        "context": "Heritage-listed townhouse; buyer conducting intensive due diligence and a detailed legal review.",
    },

    # ── Cycle C (rounds 11–15): Cross-stress and favourable matchups ─────────
    {
        "buyer_name": "BuyerEager",
        "buyer_personality": _BUYER_EAGER,
        "context": "Off-plan new-development flat; buyer excited about the project and eager to exchange.",
    },
    {
        "buyer_name": "BuyerCautious",
        "buyer_personality": _BUYER_CAUTIOUS,
        "context": "Cross-border purchase; overseas buyer in a different time zone adds significant communication lag.",
    },
    {
        "buyer_name": "BuyerInvestor",
        "buyer_personality": _BUYER_INVESTOR,
        "context": "Portfolio expansion; third acquisition this quarter for a mid-sized property investment company.",
    },
    {
        "buyer_name": "BuyerPersistent",
        "buyer_personality": _BUYER_PERSISTENT,
        "context": "Distressed sale with a motivated seller; buyer expects a fair but thorough process.",
    },
    {
        "buyer_name": "BuyerReluctant",
        "buyer_personality": _BUYER_RELUCTANT,
        "context": "Buyer downsizing after retirement; emotionally attached to their current home and slow to commit.",
    },

    # ── Cycle D (rounds 16–20): Adverse and high-pressure conditions ─────────
    {
        "buyer_name": "BuyerExperienced",
        "buyer_personality": _BUYER_EXPERIENCED,
        "context": "Luxury penthouse purchase; buyer expects white-glove service and zero tolerance for procedural errors.",
    },
    {
        "buyer_name": "BuyerImpatient",
        "buyer_personality": _BUYER_IMPATIENT,
        "context": "Chain sale under time pressure; buyer's own sale completes within days and any delay collapses the chain.",
    },
    {
        "buyer_name": "BuyerCautious",
        "buyer_personality": _BUYER_CAUTIOUS,
        "context": "Probate sale with a pending legal dispute; buyer taking extra precautions throughout the process.",
    },
    {
        "buyer_name": "BuyerInvestor",
        "buyer_personality": _BUYER_INVESTOR,
        "context": "Auction purchase with a legally binding 28-day completion deadline; every day of delay is contractually costly.",
    },
    {
        "buyer_name": "BuyerEager",
        "buyer_personality": _BUYER_EAGER,
        "context": "Overseas relocation; buyer purchasing remotely and trusting the agent entirely to manage the local process.",
    },

    # ── Cycle E (rounds 21–25): Statistical tail — final convergence ─────────
    {
        "buyer_name": "BuyerPersistent",
        "buyer_personality": _BUYER_PERSISTENT,
        "context": "Slow market; property has been listed for six months and buyer knows they have negotiating leverage.",
    },
    {
        "buyer_name": "BuyerDemanding",
        "buyer_personality": _BUYER_DEMANDING,
        "context": "New-build with a snagging list; buyer will not sign until every defect is formally documented and addressed.",
    },
    {
        "buyer_name": "BuyerReluctant",
        "buyer_personality": _BUYER_RELUCTANT,
        "context": "Buyer making an offer under family pressure; their resolve is fragile and they may withdraw at any point.",
    },
    {
        "buyer_name": "BuyerExperienced",
        "buyer_personality": _BUYER_EXPERIENCED,
        "context": "High-value commercial-residential conversion; buyer well-versed in complex mixed-use transactions.",
    },
    {
        "buyer_name": "BuyerInvestor",
        "buyer_personality": _BUYER_INVESTOR,
        "context": "Short-lease apartment requiring urgent action to avoid a penalty; any process delay invalidates the deal.",
    },
]

# Build the flat profiles list: 25 rounds × 4 agents = 100 interactions.
# All agents in a round share the same buyer and context for direct comparability.
PROPERTY_PURCHASE_PERSONALITIES = []
for _round_idx, _rnd in enumerate(_ROUNDS):
    for _agent_idx, _agent in enumerate(_AGENTS):
        _tx_num = _round_idx * 4 + _agent_idx + 1
        PROPERTY_PURCHASE_PERSONALITIES.append({
            "interactionId": f"TX-EVAL-{_tx_num:03d}",
            "agent": _agent,
            "buyer": {
                "partyName": _rnd["buyer_name"],
                "personality": _rnd["buyer_personality"],
            },
            "context": _rnd["context"],
        })


# ─────────────────────────────────────────────────────────────────────────────
# 2. GEMINI PROMPT TEMPLATES
# ─────────────────────────────────────────────────────────────────────────────

PP_SYSTEM_PROMPT = """
You are a simulation parameter generator for a real-estate reputation system.
Convert personality descriptions into concrete numeric interaction parameters.
Return ONLY valid JSON — no markdown, no explanation.

CRITICAL RULE FOR FEEDBACK SCORES:
Feedback scores measure THE OTHER PARTY'S behaviour — NOT the rater's own behaviour.
  - agent_feedback_about_buyer: the AGENT is rating THE BUYER. Use the BUYER's behaviour.
  - buyer_feedback_about_agent: the BUYER is rating THE AGENT. Use the AGENT's behaviour.

Example: A buyer who responds in 2 hours but is paired with a slow agent must:
  → receive a HIGH availability score FROM the agent (buyer was very responsive)
  → give a LOW availability score TO the agent (agent uploaded contract 72h late)
Never mix up the direction.

PROPERTY PURCHASE INTERACTION SCHEMA:
- proposals: list of proposal rounds. Each round:
    - buyer_response_hours: int (1–168)
    - outcome: "approved" | "rejected"
  Last round must always be "approved". Generate 1–4 rounds.
- contract_upload_hours: int (1–96) — hours after final approval before agent uploads first contract
- voided_contracts: int (0–2) — times agent voids the contract and re-uploads
- void_to_reupload_hours: int (0–24) — hours between void and re-upload (0 if no voids)
- contract_signing_hours: int (1–72) — hours after the LAST upload before both parties sign
                          (set to 0 if transaction_outcome is "SELL_CANCELED")
- transaction_outcome: "SELL_CLOSED" | "SELL_CANCELED"
  Use "SELL_CANCELED" when the agent backs out or abandons the deal.
  Use "SELL_CLOSED" for all normal completions.
  When "SELL_CANCELED": the agent uploaded a contract but then withdrew — no signing occurs.
- agent_feedback_about_buyer (AGENT rates THE BUYER):
    professionalism: float 0.0–1.0 — how professional and reliable was THE BUYER
    availability:    float 0.0–1.0 — how fast and responsive was THE BUYER
                     (buyer responded in 1h → near 1.0; buyer took 72h → near 0.1)
    honesty:         float 0.0–1.0 — how honest and accurate was THE BUYER
- buyer_feedback_about_agent (BUYER rates THE AGENT):
    professionalism: float 0.0–1.0 — how professional and reliable was THE AGENT
                     (agent who abandoned/backed out of a deal → 0.05 or lower;
                      agent who voided a contract → near 0.3;
                      smooth, committed agent → near 1.0)
    availability:    float 0.0–1.0 — how fast and responsive was THE AGENT
                     (agent uploaded contract in 4h → near 1.0; took 72h → near 0.0)
    honesty:         float 0.0–1.0 — how honest and accurate were THE AGENT's proposals
                     (first-try approval → near 1.0; 2 rejections needed → near 0.35; 3 rejections → near 0.15)

SCORING CONTEXT:
- Responsiveness cap is 24h — times above 24h score near 0.0
- Agent reliability = transaction completed × penalty for voided contracts
  (SELL_CANCELED → transactionCompleted=false → reliability = 0.3 regardless of voids)
- Agent accuracy = ratio of first-try approved proposals to total proposals
- voided_contracts: set to 0 unless the agent personality explicitly describes a voiding pattern

Return JSON matching this exact shape:
{
  "proposals": [{"buyer_response_hours": int, "outcome": "approved"|"rejected"}],
  "contract_upload_hours": int,
  "voided_contracts": int,
  "void_to_reupload_hours": int,
  "contract_signing_hours": int,
  "transaction_outcome": "SELL_CLOSED"|"SELL_CANCELED",
  "agent_feedback_about_buyer": {"professionalism": float, "availability": float, "honesty": float},
  "buyer_feedback_about_agent": {"professionalism": float, "availability": float, "honesty": float}
}
"""


# ─────────────────────────────────────────────────────────────────────────────
# 3. GEMINI CALLS
# ─────────────────────────────────────────────────────────────────────────────

def call_gemini(client, model_name: str, system_prompt: str, user_message: str) -> dict:
    response = client.models.generate_content(
        model=model_name,
        contents=f"{system_prompt}\n\nUSER REQUEST:\n{user_message}",
    )
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def generate_pp_params(client, model_name: str, profile: dict) -> dict:
    agent_p = profile["agent"]["personality"]
    buyer_p = profile["buyer"]["personality"]
    context = profile.get("context", "")
    context_line = f"Transaction context: {context}\n\n" if context else ""
    user_msg = f"{context_line}Agent personality: {agent_p}\n\nBuyer personality: {buyer_p}"
    print(f"  Calling Gemini for {profile['interactionId']}...", end=" ", flush=True)
    result = call_gemini(client, model_name, PP_SYSTEM_PROMPT, user_msg)
    print("done")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 4. DAML HELPERS
# ─────────────────────────────────────────────────────────────────────────────

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def to_daml_var(party_name: str) -> str:
    return party_name[0].lower() + party_name[1:]


def fmt_time(dt: datetime) -> str:
    return (
        f"time (date {dt.year} {_MONTHS[dt.month - 1]} {dt.day}) "
        f"{dt.hour} {dt.minute} 0"
    )


def fmt_decimal(v: float) -> str:
    return f"Some {v:.2f}"


# ─────────────────────────────────────────────────────────────────────────────
# 5. INTERACTION DAML GENERATORS
# ─────────────────────────────────────────────────────────────────────────────

def generate_pp_daml(profile: dict, params: dict, base_date: datetime) -> str:
    interaction_id = profile["interactionId"]
    agent_party = profile["agent"]["partyName"]
    buyer_party = profile["buyer"]["partyName"]
    agent_var = to_daml_var(agent_party)
    buyer_var = to_daml_var(buyer_party)
    var = interaction_id.replace("-", "_").lower()

    voided = params.get("voided_contracts", 0)
    void_hours = max(1, params.get("void_to_reupload_hours", 8))

    lines = []
    lines.append(f"  -- ═══════════════════════════════════════════════════════════")
    lines.append(f"  -- {interaction_id}: {agent_party} (Agent) + {buyer_party} (Buyer)")
    lines.append(f"  -- ═══════════════════════════════════════════════════════════")

    cursor = base_date
    proposal_times = []
    for proposal in params["proposals"]:
        t_submit = cursor
        cursor += timedelta(hours=proposal["buyer_response_hours"])
        proposal_times.append((t_submit, cursor, proposal["outcome"]))

    t_uploads: list[datetime] = []
    t_voids: list[datetime] = []

    is_canceled = params.get("transaction_outcome", "SELL_CLOSED") == "SELL_CANCELED"

    cursor += timedelta(hours=params["contract_upload_hours"])
    t_uploads.append(cursor)
    for _ in range(voided):
        t_void = cursor + timedelta(hours=4)
        t_voids.append(t_void)
        cursor = t_void + timedelta(hours=void_hours)
        t_uploads.append(cursor)

    if is_canceled:
        t_close = t_uploads[-1] + timedelta(hours=2)
    else:
        t_contract_sign = t_uploads[-1] + timedelta(hours=params["contract_signing_hours"])
        t_close = t_contract_sign + timedelta(hours=1)
    t_complete = t_close + timedelta(hours=1)
    t_feedback = t_complete + timedelta(hours=24)

    lines.append(f"  let {var}_t0 = {fmt_time(base_date)}")
    for i, (t_sub, t_res, _) in enumerate(proposal_times):
        lines.append(f"      {var}_p{i+1}_submit  = {fmt_time(t_sub)}")
        lines.append(f"      {var}_p{i+1}_respond = {fmt_time(t_res)}")
    for i, t_up in enumerate(t_uploads):
        lines.append(f"      {var}_cu{i+1}          = {fmt_time(t_up)}")
    for i, t_void in enumerate(t_voids):
        lines.append(f"      {var}_cv{i+1}          = {fmt_time(t_void)}")
    if not is_canceled:
        lines.append(f"      {var}_contract_sign   = {fmt_time(t_contract_sign)}")
    lines.append(f"      {var}_close    = {fmt_time(t_close)}")
    lines.append(f"      {var}_complete = {fmt_time(t_complete)}")
    lines.append(f"      {var}_feedback = {fmt_time(t_feedback)}")
    lines.append("")

    lines.append(f"  {var}_draftCid <- submit {agent_var} do")
    lines.append(f"    createCmd DraftInteraction with")
    lines.append(f"      operator; initiator = {agent_var}; initiatorRole = Agent")
    lines.append(f"      interactionId = \"{interaction_id}\"")
    lines.append(f"      interactionType = \"PropertyPurchase\"")
    lines.append(f"      participants = [({buyer_var}, Buyer)]")
    lines.append(f"      openedAt = {var}_t0")
    lines.append("")

    lines.append(f"  {var}_ipCid <- submit {agent_var} do")
    lines.append(f"    exerciseCmd {var}_draftCid Begin with startedAt = {var}_t0; configCid = iPPConfigCid")
    lines.append("")

    for i, (t_sub, t_res, outcome) in enumerate(proposal_times):
        resource = f"proposal-{i+1:03}"
        lines.append(f"  {var}_ipCid <- submit operator do")
        lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
        lines.append(f"      event = RecordedEvent with")
        lines.append(f"        event = ProposalSubmitted; actor = {agent_var}; occurredAt = {var}_p{i+1}_submit")
        lines.append(f"        resourceId = Some \"{resource}\"")
        lines.append("")
        if outcome == "rejected":
            lines.append(f"  {var}_ipCid <- submit operator do")
            lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
            lines.append(f"      event = RecordedEvent with")
            lines.append(f"        event = ProposalRejectedWithNotes; actor = {buyer_var}; occurredAt = {var}_p{i+1}_respond")
            lines.append(f"        resourceId = Some \"{resource}\"")
            lines.append("")
        else:
            lines.append(f"  {var}_ipCid <- submit operator do")
            lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
            lines.append(f"      event = RecordedEvent with")
            lines.append(f"        event = ProposalApproved; actor = {buyer_var}; occurredAt = {var}_p{i+1}_respond")
            lines.append(f"        resourceId = Some \"{resource}\"")
            lines.append("")

    for i, t_up in enumerate(t_uploads):
        c_num = i + 1
        lines.append(f"  {var}_ipCid <- submit operator do")
        lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
        lines.append(f"      event = RecordedEvent with")
        lines.append(f"        event = ContractUploaded; actor = {agent_var}; occurredAt = {var}_cu{c_num}")
        lines.append(f"        resourceId = Some \"contract-{c_num:03}\"")
        lines.append("")
        if i < len(t_voids):
            lines.append(f"  {var}_ipCid <- submit operator do")
            lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
            lines.append(f"      event = RecordedEvent with")
            lines.append(f"        event = ContractVoided; actor = {agent_var}; occurredAt = {var}_cv{i+1}")
            lines.append(f"        resourceId = Some \"contract-{c_num:03}\"")
            lines.append("")

    if not is_canceled:
        final_c = len(t_uploads)
        for signer_var in [agent_var, buyer_var]:
            lines.append(f"  {var}_ipCid <- submit operator do")
            lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
            lines.append(f"      event = RecordedEvent with")
            lines.append(f"        event = ContractSigned; actor = {signer_var}; occurredAt = {var}_contract_sign")
            lines.append(f"        resourceId = Some \"contract-{final_c:03}\"")
            lines.append("")

    outcome_str = "SELL_CANCELED" if is_canceled else "SELL_CLOSED"
    lines.append(f"  {var}_ipCid <- submit operator do")
    lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
    lines.append(f"      event = RecordedEvent with")
    lines.append(f"        event = TransactionStateChanged; actor = {agent_var}; occurredAt = {var}_close")
    lines.append(f"        resourceId = Some \"{outcome_str}\"")
    lines.append("")

    lines.append(f"  {var}_completedCid <- submit {agent_var} do")
    lines.append(f"    exerciseCmd {var}_ipCid Complete with completedAt = {var}_complete")
    lines.append("")

    lines.append(f"  (_, {var}_reqs) <- submit operator do")
    lines.append(f"    exerciseCmd ppConfigCid PP.CreateObservations with completedCid = {var}_completedCid")
    lines.append("")
    lines.append(f"  let [{var}_agentReq, {var}_buyerReq] = {var}_reqs")
    lines.append("")

    fb = params["agent_feedback_about_buyer"]
    lines.append(f"  -- {agent_party} (agent) gives feedback about {buyer_party} (buyer)")
    lines.append(f"  submit {agent_var} do")
    lines.append(f"    exerciseCmd (fromInterfaceContractId {var}_agentReq : ContractId PropertyPurchaseFeedbackRequest)")
    lines.append(f"      SubmitFeedback with")
    lines.append(f"        professionalism = {fmt_decimal(fb['professionalism'])}")
    lines.append(f"        availability    = {fmt_decimal(fb['availability'])}")
    lines.append(f"        honesty         = {fmt_decimal(fb['honesty'])}")
    lines.append(f"        submittedAt = {var}_feedback")
    lines.append("")

    fb2 = params["buyer_feedback_about_agent"]
    lines.append(f"  -- {buyer_party} (buyer) gives feedback about {agent_party} (agent)")
    lines.append(f"  submit {buyer_var} do")
    lines.append(f"    exerciseCmd (fromInterfaceContractId {var}_buyerReq : ContractId PropertyPurchaseFeedbackRequest)")
    lines.append(f"      SubmitFeedback with")
    lines.append(f"        professionalism = {fmt_decimal(fb2['professionalism'])}")
    lines.append(f"        availability    = {fmt_decimal(fb2['availability'])}")
    lines.append(f"        honesty         = {fmt_decimal(fb2['honesty'])}")
    lines.append(f"        submittedAt = {var}_feedback")
    lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# 6. MULTI-FILE DAML ASSEMBLY
# ─────────────────────────────────────────────────────────────────────────────

_SETUP_HEADER = """\
module Scripts.EvalSeedAgentSetup where

import Daml.Script
import DA.Time (time)
import DA.Date (date, Month(..))
import DA.Text (isPrefixOf)

import Reputation.PropertyPurchase.Configuration (PropertyPurchaseConfiguration(..))
import Reputation.Role.Configuration (RoleConfiguration(..), CreateRole(..))
import Reputation.Types

evalSeedAgentSetup : Script ()
evalSeedAgentSetup = do

  -- ── Parties ────────────────────────────────────────────────────────────
  knownParties <- listKnownParties
  operator <- case find (\\pd -> "Operator::" `isPrefixOf` (partyToText pd.party)) knownParties of
    None -> fail "Operator party not found. Run Setup first."
    Some pd -> pure pd.party

"""


def build_setup_daml(pp_profiles: list) -> str:
    """Generates EvalSeedAgentSetup.daml: party allocation and role/config creation only."""
    agents  = sorted({p["agent"]["partyName"] for p in pp_profiles})
    buyers  = sorted({p["buyer"]["partyName"] for p in pp_profiles})

    all_parties = (
        [(p, "Agent") for p in agents] +
        [(p, "Buyer") for p in buyers]
    )

    lines = [_SETUP_HEADER.rstrip()]
    col = max(len(to_daml_var(p)) for p, _ in all_parties) + 1
    for party, _ in sorted(all_parties, key=lambda x: x[0]):
        var = to_daml_var(party)
        lines.append(f"  {var:<{col}} <- allocatePartyByHint (PartyIdHint \"{party}\")")
    lines.append("")
    lines.append("  let t0 = time (date 2026 Jun 1) 0 0 0")
    lines.append("")
    lines.append("  -- ── Role configuration ───────────────────────────────────────────")
    lines.append("  roleConfigCid <- submit operator do")
    lines.append("    createCmd RoleConfiguration with")
    lines.append("      operator")
    lines.append('      configId        = "EVAL-ROLE-CONFIG"')
    lines.append("      createdAt       = t0")
    lines.append("      agentWeights    = AgentWeights    with reliability = 0.5; responsiveness = 0.3; accuracy = 0.2")
    lines.append("      buyerWeights    = BuyerWeights    with reliability = 0.4; responsiveness = 0.4; accuracy = 0.2")
    lines.append("      landlordWeights = LandlordWeights with reliability = 0.5; responsiveness = 0.3; accuracy = 0.2")
    lines.append("      tenantWeights   = TenantWeights   with reliability = 0.5; responsiveness = 0.3; accuracy = 0.2")
    lines.append("      scoreFloor      = 0.0")
    lines.append("      scoreCeiling    = 100.0")
    lines.append("      startValue      = 50.0")
    lines.append('      tiers           = [("Bronze", 60.0), ("Silver", 75.0), ("Gold", 90.0)]')
    lines.append("")
    for party, role in sorted(all_parties, key=lambda x: x[0]):
        var = to_daml_var(party)
        lines.append(f"  _ <- submit operator do exerciseCmd roleConfigCid CreateRole with party = {var}; roleType = {role}; assignedAt = t0")
    lines.append("")
    lines.append("  -- ── Property purchase configuration ──────────────────────────────")
    lines.append("  _ <- submit operator do")
    lines.append("    createCmd PropertyPurchaseConfiguration with")
    lines.append("      operator")
    lines.append('      configId  = "EVAL-PP-CONFIG"')
    lines.append("      createdAt = t0")
    lines.append("      agentObsWeights = AgentObservationWeights with")
    lines.append("        reliabilityVoidedWeight                = 0.3")
    lines.append("        reliabilityCompletionWeight            = 0.7")
    lines.append("        responsivenessProposalToContractWeight = 0.6")
    lines.append("        responsivenessContractWeight           = 0.4")
    lines.append("        responsivenessCapHours                 = 24.0")
    lines.append("      buyerObsWeights = BuyerObservationWeights with")
    lines.append("        responsivenessContractWeight = 0.6")
    lines.append("        responsivenessProposalWeight = 0.4")
    lines.append("        responsivenessCapHours       = 24.0")
    lines.append("      feedbackWindowDays = 30")
    lines.append("")
    lines.append("  pure ()")
    lines.append("")
    return "\n".join(lines)


def build_round_daml(round_num: int, profiles: list, params_list: list, start_base: datetime) -> str:
    """Generates EvalSeedAgentRound{N}.daml: looks up existing parties, runs 4 interactions."""
    fn     = f"evalSeedAgentRound{round_num}"
    module = f"Scripts.EvalSeedAgentRound{round_num}"

    agents = sorted({p["agent"]["partyName"] for p in profiles})
    buyers = sorted({p["buyer"]["partyName"] for p in profiles})

    # All profiles in a round share the same buyer and context.
    round_buyer   = profiles[0]["buyer"]["partyName"]
    round_context = profiles[0].get("context", "")

    lines = []
    lines.append(f"-- Round {round_num}: {round_buyer} — {round_context}")
    lines.append(f"module {module} where")
    lines.append("")
    lines.append("import Daml.Script")
    lines.append("import DA.Time (time)")
    lines.append("import DA.Date (date, Month(..))")
    lines.append("import DA.Text (isPrefixOf)")
    lines.append("")
    lines.append("import Reputation.PropertyPurchase.Configuration (PropertyPurchaseConfiguration(..))")
    lines.append("import Reputation.PropertyPurchase.Configuration qualified as PP")
    lines.append("import Reputation.Interaction.Draft (DraftInteraction(..), Begin(..))")
    lines.append("import Reputation.Interaction.InProgress (RecordEvent(..), Complete(..))")
    lines.append("import Reputation.Interface.Configuration qualified as Configuration (I)")
    lines.append("import Reputation.Types")
    lines.append("import Reputation.PropertyPurchase.Feedback (PropertyPurchaseFeedbackRequest, SubmitFeedback(..))")
    lines.append("")
    lines.append(f"{fn} : Script ()")
    lines.append(f"{fn} = do")
    lines.append("")
    lines.append("  -- ── Look up parties ───────────────────────────────────────────────")
    lines.append("  knownParties <- listKnownParties")
    lines.append("  let lookupParty name = case find (\\pd -> (name <> \"::\") `isPrefixOf` (partyToText pd.party)) knownParties of")
    lines.append("        None -> fail $ \"Party not found: \" <> name")
    lines.append("        Some pd -> pure pd.party")
    lines.append("")
    lines.append("  operator         <- case find (\\pd -> \"Operator::\" `isPrefixOf` (partyToText pd.party)) knownParties of")
    lines.append("    None -> fail \"Operator party not found.\"")
    lines.append("    Some pd -> pure pd.party")

    col = max(len(to_daml_var(p)) for p in agents + buyers) + 1
    for party in agents:
        var = to_daml_var(party)
        lines.append(f"  {var:<{col}} <- lookupParty \"{party}\"")
    for party in buyers:
        var = to_daml_var(party)
        lines.append(f"  {var:<{col}} <- lookupParty \"{party}\"")

    lines.append("")
    lines.append("  -- ── Look up PP config ─────────────────────────────────────────────")
    lines.append("  ppConfigs <- query @PropertyPurchaseConfiguration operator")
    lines.append("  ppConfigCid <- case find (\\(_, c) -> c.configId == \"EVAL-PP-CONFIG\") ppConfigs of")
    lines.append("    None -> fail \"PropertyPurchaseConfiguration 'EVAL-PP-CONFIG' not found. Run EvalSeedAgentSetup first.\"")
    lines.append("    Some (cid, _) -> pure cid")
    lines.append("  let iPPConfigCid : ContractId Configuration.I = toInterfaceContractId ppConfigCid")
    lines.append("")

    base = start_base
    for profile, params in zip(profiles, params_list):
        lines.append(generate_pp_daml(profile, params, base))
        base += timedelta(days=60)

    lines.append("  pure ()")
    lines.append("")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# 9. ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI Agent Simulation for Reputation System Evaluation")
    parser.add_argument("--output-dir", default=".", help="Directory to write output DAML files")
    parser.add_argument("--model", required=True, help="Gemini model to use (e.g. gemini-2.0-flash)")
    args = parser.parse_args()

    n_rounds  = len(_ROUNDS)
    n_agents  = len(_AGENTS)
    pp_count  = len(PROPERTY_PURCHASE_PERSONALITIES)
    n_buyers  = len({p["buyer"]["partyName"] for p in PROPERTY_PURCHASE_PERSONALITIES})

    print(f"Reputation System — AI Agent Evaluation Simulator")
    print(f"Model     : {args.model}")
    print(f"Output    : {os.path.abspath(args.output_dir)}/")
    print(f"PP        : {pp_count} interactions  ({n_agents} agents × {n_rounds} rounds, {n_buyers} buyer archetypes)")
    print()
    print("Agent archetypes:")
    print("  AgentPro          — high reliability, high responsiveness, high accuracy")
    print("  AgentSlowUploader — high accuracy, LOW responsiveness, normal reliability")
    print("  AgentHighReject   — high responsiveness, normal reliability, LOW accuracy")
    print("  AgentUnreliable   — LOW reliability (backs out), medium responsiveness, medium accuracy")
    print()
    print("Buyer archetypes (all agents share same buyer + context per round):")
    print("  BuyerImpatient  — stresses responsiveness (rounds 1, 9, 17)")
    print("  BuyerDemanding  — stresses accuracy       (rounds 2, 10, 22)")
    print("  BuyerEager      — neutral baseline         (rounds 3, 11, 20)")
    print("  BuyerPersistent — moderate stress          (rounds 4, 14, 21)")
    print("  BuyerCautious   — long timelines, patience (rounds 5, 12, 18)")
    print("  BuyerInvestor   — stresses speed + accuracy (rounds 6, 13, 19, 25)")
    print("  BuyerReluctant  — high rejection rate      (rounds 7, 15, 23)")
    print("  BuyerExperienced— precise, high standards  (rounds 8, 16, 24)")
    print()
    print("Cycle structure:")
    for i, rnd in enumerate(_ROUNDS, 1):
        print(f"  Round {i:2d}: {rnd['buyer_name']:<18} — {rnd['context']}")
    print()

    gemini_client = genai.Client(
        vertexai=True, project="agisit-2025-proj-99123", location="global",
    )

    print("Generating Property Purchase interaction parameters...")
    pp_params = [generate_pp_params(gemini_client, args.model, p) for p in PROPERTY_PURCHASE_PERSONALITIES]

    out = args.output_dir

    print("\nAssembling EvalSeedAgentSetup.daml...")
    setup_path = os.path.join(out, "EvalSeedAgentSetup.daml")
    with open(setup_path, "w") as f:
        f.write(build_setup_daml(PROPERTY_PURCHASE_PERSONALITIES))
    print(f"  Written: {setup_path}")

    print("\nAssembling round files...")
    base = datetime(2026, 6, 1, 9, 0, 0)
    for round_num in range(1, n_rounds + 1):
        idx = (round_num - 1) * n_agents
        round_profiles = PROPERTY_PURCHASE_PERSONALITIES[idx : idx + n_agents]
        round_params   = pp_params[idx : idx + n_agents]
        round_path = os.path.join(out, f"EvalSeedAgentRound{round_num}.daml")
        with open(round_path, "w") as f:
            f.write(build_round_daml(round_num, round_profiles, round_params, base))
        print(f"  Written: {round_path}")
        base += timedelta(days=60 * n_agents)

    print()

if __name__ == "__main__":
    main()
