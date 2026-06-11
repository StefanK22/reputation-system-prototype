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
# Shared buyer personalities — one per round, same across all four agents.
# Each buyer stresses a different dimension of agent performance.
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


# ─────────────────────────────────────────────────────────────────────────────
# 1. PERSONALITY PROFILES
# ─────────────────────────────────────────────────────────────────────────────

PROPERTY_PURCHASE_PERSONALITIES = [

    # ════════════════════════════════════════════════════════════════════
    # Round 1 — BuyerImpatient (stresses responsiveness)
    # AgentSlowUploader's weak dimension dominates; others reveal contrast.
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-001",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {"partyName": "BuyerImpatient", "personality": _BUYER_IMPATIENT},
    },
    {
        "interactionId": "TX-EVAL-002",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {"partyName": "BuyerImpatient", "personality": _BUYER_IMPATIENT},
    },
    {
        "interactionId": "TX-EVAL-003",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {"partyName": "BuyerImpatient", "personality": _BUYER_IMPATIENT},
    },
    {
        "interactionId": "TX-EVAL-004",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {"partyName": "BuyerImpatient", "personality": _BUYER_IMPATIENT},
    },

    # ════════════════════════════════════════════════════════════════════
    # Round 2 — BuyerDemanding (stresses accuracy)
    # AgentHighReject's weak dimension dominates; others reveal contrast.
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-005",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {"partyName": "BuyerDemanding", "personality": _BUYER_DEMANDING},
    },
    {
        "interactionId": "TX-EVAL-006",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {"partyName": "BuyerDemanding", "personality": _BUYER_DEMANDING},
    },
    {
        "interactionId": "TX-EVAL-007",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {"partyName": "BuyerDemanding", "personality": _BUYER_DEMANDING},
    },
    {
        "interactionId": "TX-EVAL-008",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {"partyName": "BuyerDemanding", "personality": _BUYER_DEMANDING},
    },

    # ════════════════════════════════════════════════════════════════════
    # Round 3 — BuyerEager (neutral baseline)
    # Clean signal for all four agents without extreme pressure.
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-009",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {"partyName": "BuyerEager", "personality": _BUYER_EAGER},
    },
    {
        "interactionId": "TX-EVAL-010",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {"partyName": "BuyerEager", "personality": _BUYER_EAGER},
    },
    {
        "interactionId": "TX-EVAL-011",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {"partyName": "BuyerEager", "personality": _BUYER_EAGER},
    },
    {
        "interactionId": "TX-EVAL-012",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {"partyName": "BuyerEager", "personality": _BUYER_EAGER},
    },

    # ════════════════════════════════════════════════════════════════════
    # Round 4 — BuyerPersistent (moderate stress)
    # Fair, thorough observer; captures weaknesses without extreme amplification.
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-013",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {"partyName": "BuyerPersistent", "personality": _BUYER_PERSISTENT},
    },
    {
        "interactionId": "TX-EVAL-014",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {"partyName": "BuyerPersistent", "personality": _BUYER_PERSISTENT},
    },
    {
        "interactionId": "TX-EVAL-015",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {"partyName": "BuyerPersistent", "personality": _BUYER_PERSISTENT},
    },
    {
        "interactionId": "TX-EVAL-016",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {"partyName": "BuyerPersistent", "personality": _BUYER_PERSISTENT},
    },
]


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
    user_msg = f"Agent personality: {agent_p}\n\nBuyer personality: {buyer_p}"
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
# 5. INTERACTION DAML GENERATORS (unchanged logic)
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
    lines.append('      tiers           = [("a", 0.0)]')
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

    lines = []
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

    pp_count = len(PROPERTY_PURCHASE_PERSONALITIES)
    n_agents = len({p["agent"]["partyName"] for p in PROPERTY_PURCHASE_PERSONALITIES})
    n_buyers = len({p["buyer"]["partyName"] for p in PROPERTY_PURCHASE_PERSONALITIES})

    print(f"Reputation System — AI Agent Evaluation Simulator")
    print(f"Model     : {args.model}")
    print(f"Output    : {os.path.abspath(args.output_dir)}/")
    print(f"PP        : {pp_count} interactions  ({n_agents} agents × 4 rounds, {n_buyers} shared buyers)")
    print()
    print("Agent archetypes:")
    print("  AgentPro          — high reliability, high responsiveness, high accuracy")
    print("  AgentSlowUploader — high accuracy, LOW responsiveness, normal reliability")
    print("  AgentHighReject   — high responsiveness, normal reliability, LOW accuracy")
    print("  AgentUnreliable   — LOW reliability (backs out), medium responsiveness, medium accuracy")
    print()
    print("Shared buyer personalities (one per round):")
    print("  Round 1 — BuyerImpatient  : stresses responsiveness")
    print("  Round 2 — BuyerDemanding  : stresses accuracy")
    print("  Round 3 — BuyerEager      : neutral baseline")
    print("  Round 4 — BuyerPersistent : moderate stress")
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
    for round_num in range(1, 5):
        idx = (round_num - 1) * 4
        round_profiles = PROPERTY_PURCHASE_PERSONALITIES[idx : idx + 4]
        round_params   = pp_params[idx : idx + 4]
        round_path = os.path.join(out, f"EvalSeedAgentRound{round_num}.daml")
        with open(round_path, "w") as f:
            f.write(build_round_daml(round_num, round_profiles, round_params, base))
        print(f"  Written: {round_path}")
        base += timedelta(days=60 * 4)

    print()

if __name__ == "__main__":
    main()
