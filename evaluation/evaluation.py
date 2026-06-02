import argparse
import json
from datetime import datetime, timedelta
from google import genai


# ─────────────────────────────────────────────────────────────────────────────
# \ personality descriptions
# Each archetype has ONE clearly weak dimension so scores are visibly separated.
# ─────────────────────────────────────────────────────────────────────────────

_AGENT_PRO = (
    "An elite real-estate agent who excels on every dimension. "
    "Proposals are flawlessly prepared and approved on the first round every time. "
    "Uploads contracts within 2–4 hours of final proposal approval; both parties sign "
    "the same day. Never voids a contract. Every transaction closes successfully. "
    "Communicates proactively and gives honest, generous feedback about counterparties."
)
# Expected: Reliability ~92 | Responsiveness ~84 | Accuracy ~92

_AGENT_SLOW_UPLOADER = (
    "A technically skilled agent who prepares excellent proposals — always approved on "
    "the first round. However he is chronically slow at the post-approval stage: "
    "takes 60–72 hours to upload the contract after approval, and another 36–48 hours "
    "before the contract is signed. Buyers frequently complain he 'disappears' after the "
    "proposal is accepted. Never voids contracts; every transaction eventually closes. "
    "Gives neutral feedback; his buyers always rate his responsiveness as very poor."
)
# Expected: Reliability ~79 | Responsiveness ~12 | Accuracy ~91

_AGENT_HIGH_REJECT = (
    "A highly responsive agent who uploads contracts within 4 hours of approval and "
    "signs the same day. Never voids contracts; transactions always close. "
    "However, his proposals are consistently under-prepared: buyers reject them 2–3 times "
    "before a revised version is finally accepted. Buyers are frustrated by repeated "
    "revision cycles and give him low honesty/accuracy scores. "
    "Gives candid feedback about buyers."
)
# Expected: Reliability ~77 | Responsiveness ~83 | Accuracy ~30

_AGENT_UNRELIABLE = (
    "An agent who regularly abandons transactions: 3 out of 4 deals are cancelled "
    "(SELL_CANCELED) — the agent uploads the contract within 3–5 hours of approval "
    "but then withdraws, citing external complications. Only 1 deal closes successfully. "
    "Proposals need 1–2 rounds across all interactions. "
    "Buyers in cancelled deals give the agent very low professionalism scores (deal abandoned) "
    "but medium-high availability (agent was fast throughout) and medium honesty "
    "(proposals were reasonable). The buyer in the completed deal gives high scores overall."
)
# Expected: Reliability ~40 | Responsiveness ~67 | Accuracy ~78

_LANDLORD_FAIR = (
    "A professional, responsive landlord. Reviews uploaded documents within 4–8 hours. "
    "Approves well-prepared submissions on the first try. "
    "Clear about requirements from the start. "
    "Gives honest, encouraging feedback to tenants."
)
# Expected: Reliability ~92 | Responsiveness ~78 | Accuracy ~89

_LANDLORD_SLOW_REVIEWER = (
    "A fair landlord whose decisions are accurate — approves correct documents on the "
    "first try and never rejects arbitrarily. However, he takes 60–72 hours to review "
    "each submission regardless of quality. Tenants are very frustrated by the wait times. "
    "Tenants give him very low availability scores due to the long review delays, "
    "but acknowledge his decisions are fair once they eventually arrive."
)
# Expected: Reliability ~82 | Responsiveness ~11 | Accuracy ~87

_LANDLORD_PICKY = (
    "A landlord who responds to every submission within 2–4 hours but almost always "
    "finds a reason to reject the first attempt — even from well-prepared tenants. "
    "Requires 2–3 rounds before approving any document. "
    "Tenants find the bar arbitrary and inconsistent. "
    "Tenants give him low requirement-clarity and low fairness scores, "
    "but acknowledge his fast response times."
)
# Expected: Reliability ~59 | Responsiveness ~74 | Accuracy ~13


# ─────────────────────────────────────────────────────────────────────────────
# 1. PERSONALITY PROFILES
# ─────────────────────────────────────────────────────────────────────────────

PROPERTY_PURCHASE_PERSONALITIES = [

    # ════════════════════════════════════════════════════════════════════
    # AgentPro — 4 interactions
    # Expected: high reliability, high responsiveness, high accuracy
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-001",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {
            "partyName": "BuyerQuick",
            "personality": (
                "An ideal buyer who responds to proposals within 1–2 hours and approves "
                "on the first round. Signs contracts the same day they are uploaded. "
                "Very satisfied with the agent's speed and quality; gives the agent "
                "excellent availability and honesty feedback."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-002",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {
            "partyName": "BuyerNegotiating",
            "personality": (
                "A savvy buyer who always rejects the first proposal once to negotiate "
                "better terms, then approves the revised proposal within 4 hours. "
                "Signs contracts promptly. Appreciates the agent's fast contract upload "
                "and high-quality proposals; gives the agent high availability "
                "and high honesty feedback."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-003",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {
            "partyName": "BuyerMethodical",
            "personality": (
                "A careful buyer who takes 24–36 hours to review each proposal and "
                "asks for one small revision before approving. Signs within 24 hours "
                "of upload. Despite the buyer's slower pace, the agent's rapid contract "
                "turnaround and accurate proposals earn the agent high availability "
                "and high honesty scores from the buyer."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-004",
        "agent": {"partyName": "AgentPro", "personality": _AGENT_PRO},
        "buyer": {
            "partyName": "BuyerDemanding",
            "personality": (
                "A picky buyer who takes 48–72 hours to respond and rejects the first "
                "two proposals before approving the third. Slow to sign (36 hours). "
                "Despite the buyer's own slowness and high demands, the agent's fast "
                "contract upload and polished proposals still earn the agent high "
                "availability and high honesty feedback from the buyer."
            ),
        },
    },

    # ════════════════════════════════════════════════════════════════════
    # AgentSlowUploader — 4 interactions
    # Expected: high accuracy, LOW responsiveness, normal reliability
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-005",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {
            "partyName": "BuyerEager",
            "personality": (
                "An enthusiastic buyer who responds to proposals within 1–2 hours and "
                "approves immediately. Very frustrated when the agent takes over 60 hours "
                "to upload the contract — follows up repeatedly. Signs within an hour "
                "of the contract finally appearing. Gives the agent very low availability "
                "feedback (agent was extremely slow to upload) and high honesty feedback "
                "(the proposal itself was excellent)."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-006",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {
            "partyName": "BuyerPatient",
            "personality": (
                "A laid-back buyer who takes 12–24 hours to respond to proposals and "
                "approves after one minor revision. Not deeply bothered by delays but "
                "does note the agent's slow contract upload as frustrating. Signs "
                "promptly once the contract arrives. Gives the agent medium-low "
                "availability feedback (the upload delay was noticeable) and high "
                "honesty feedback."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-007",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {
            "partyName": "BuyerImpatient",
            "personality": (
                "A time-pressured professional who responds to proposals within 30 minutes "
                "and approves on the first round. Extremely upset when the agent takes "
                "72 hours to upload the contract — calls and emails without response. "
                "Signs immediately when the contract finally arrives. Gives the agent "
                "very low availability feedback (unacceptable wait time) and high "
                "honesty feedback (quality proposal)."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-008",
        "agent": {"partyName": "AgentSlowUploader", "personality": _AGENT_SLOW_UPLOADER},
        "buyer": {
            "partyName": "BuyerRelaxed",
            "personality": (
                "A relaxed buyer who takes 36–48 hours to review proposals and approves "
                "after one revision. Has flexible timelines and is not particularly "
                "bothered by the agent's slow contract upload. Signs at a leisurely pace. "
                "Gives the agent medium-low availability feedback (notices the delay but "
                "is forgiving) and high honesty feedback."
            ),
        },
    },

    # ════════════════════════════════════════════════════════════════════
    # AgentHighReject — 4 interactions
    # Expected: high responsiveness, normal reliability, LOW accuracy
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-009",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {
            "partyName": "BuyerCritical",
            "personality": (
                "A detail-oriented buyer who immediately rejects any proposal that doesn't "
                "meet specifications. Responds within 4 hours but rejects twice before "
                "accepting. Signs contracts quickly. Very unhappy about repeated poor "
                "proposals; gives the agent very low honesty feedback. Acknowledges "
                "the agent's fast contract upload with high availability feedback."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-010",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {
            "partyName": "BuyerPersistent",
            "personality": (
                "A determined buyer who works through multiple proposal rejections without "
                "losing patience. Responds within 12 hours; rejects twice before approving. "
                "Moderate signing pace. Frustrated by the repetition but acknowledges the "
                "agent's quick contract delivery; gives the agent medium-low honesty "
                "feedback (poor proposals) and high availability feedback."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-011",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {
            "partyName": "BuyerFrustrated",
            "personality": (
                "A buyer who becomes increasingly irritated with each rejected proposal. "
                "Responds within 8 hours but rejects three times before finally accepting. "
                "Delays signing slightly out of frustration. Gives the agent very low "
                "honesty scores for the repeated poor proposals; gives medium-high "
                "availability credit for the fast contract upload."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-012",
        "agent": {"partyName": "AgentHighReject", "personality": _AGENT_HIGH_REJECT},
        "buyer": {
            "partyName": "BuyerNovice",
            "personality": (
                "A first-time buyer who isn't sure what a good proposal looks like. "
                "Takes 24 hours to respond; rejects the first proposal reluctantly after "
                "advice from a friend, then approves the second. Signs promptly. "
                "Not fully aware the agent's proposals were below standard; gives "
                "medium honesty feedback and high availability feedback."
            ),
        },
    },

    # ════════════════════════════════════════════════════════════════════
    # AgentUnreliable — 4 interactions (3 SELL_CANCELED, 1 SELL_CLOSED)
    # Expected: LOW reliability (~40), medium responsiveness (~67), medium accuracy (~78)
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "TX-EVAL-013",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {
            "partyName": "BuyerAbandonedFirst",
            "personality": (
                "A buyer whose deal is cancelled (SELL_CANCELED) after the agent uploads "
                "the contract within 4 hours of proposal approval but then withdraws. "
                "The buyer approved the proposal on the first round and was ready to sign. "
                "Gives the agent very low professionalism (0.05 — deal abandoned with no "
                "good reason), medium-high availability (0.70 — agent was fast throughout), "
                "and medium honesty (0.60 — the proposal content was reasonable)."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-014",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {
            "partyName": "BuyerAbandonedSecond",
            "personality": (
                "A buyer whose deal is cancelled (SELL_CANCELED). The agent approved the "
                "proposal after one revision and uploaded the contract within 3 hours, "
                "then cancelled citing external complications. The buyer is very upset. "
                "Gives very low professionalism (0.05 — second time seeing this), "
                "medium availability (0.65 — agent was still responsive before cancelling), "
                "and medium honesty (0.55 — proposal was adequate)."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-015",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {
            "partyName": "BuyerAbandonedThird",
            "personality": (
                "A buyer whose deal is also cancelled (SELL_CANCELED). Agent uploaded "
                "the contract within 5 hours of first-round approval, then withdrew. "
                "Buyer is furious — this pattern is unacceptable. Gives very low "
                "professionalism (0.05), medium availability (0.65 — quick throughout), "
                "and medium honesty (0.60)."
            ),
        },
    },
    {
        "interactionId": "TX-EVAL-016",
        "agent": {"partyName": "AgentUnreliable", "personality": _AGENT_UNRELIABLE},
        "buyer": {
            "partyName": "BuyerLucky",
            "personality": (
                "A buyer who actually closes a deal with this agent (SELL_CLOSED). "
                "The agent approves the proposal on the first round, uploads the contract "
                "within 3 hours, and both parties sign promptly. The buyer is relieved "
                "and satisfied. Gives the agent high professionalism (0.85), high "
                "availability (0.90), and high honesty (0.85)."
            ),
        },
    },
]

RENTAL_AGREEMENT_PERSONALITIES = [

    # ════════════════════════════════════════════════════════════════════
    # LandlordFair — 4 interactions
    # Expected: high reliability, high responsiveness, high accuracy
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "RA-EVAL-001",
        "landlord": {"partyName": "LandlordFair", "personality": _LANDLORD_FAIR},
        "tenant": {
            "partyName": "TenantCompliant",
            "personality": (
                "An organised tenant who submits all documents correctly on the first "
                "attempt within 2 hours. Responds immediately to any request. "
                "Gives the landlord very high availability and fairness feedback "
                "because the landlord reviewed quickly and approved first try."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-002",
        "landlord": {"partyName": "LandlordFair", "personality": _LANDLORD_FAIR},
        "tenant": {
            "partyName": "TenantOrganized",
            "personality": (
                "A well-prepared tenant who submits strong documents but makes one small "
                "formatting error. After the landlord's prompt rejection with clear notes, "
                "the tenant corrects and re-uploads within 4 hours. "
                "Gives the landlord high availability and high requirement-clarity feedback "
                "because the landlord responded quickly with useful guidance."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-003",
        "landlord": {"partyName": "LandlordFair", "personality": _LANDLORD_FAIR},
        "tenant": {
            "partyName": "TenantFirstTime",
            "personality": (
                "A first-time renter who makes formatting mistakes on the first two "
                "submissions but corrects each one promptly (within 8 hours) when the "
                "landlord gives clear, helpful rejection notes. "
                "Gives the landlord high availability and high requirement-clarity feedback "
                "— the fair landlord's guidance made the process manageable."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-004",
        "landlord": {"partyName": "LandlordFair", "personality": _LANDLORD_FAIR},
        "tenant": {
            "partyName": "TenantDisorganized",
            "personality": (
                "A chaotic tenant who submits incomplete documents and takes 24–36 hours "
                "to re-upload after rejections. Despite the tenant's own slowness, "
                "the fair landlord always reviews quickly and gives clear reasons. "
                "The tenant gives the landlord high availability and high fairness "
                "feedback (the landlord was fast and fair; the tenant's own problems "
                "caused the delays)."
            ),
        },
    },

    # ════════════════════════════════════════════════════════════════════
    # LandlordSlowReviewer — 4 interactions
    # Expected: high reliability, LOW responsiveness, high accuracy
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "RA-EVAL-005",
        "landlord": {"partyName": "LandlordSlowReviewer", "personality": _LANDLORD_SLOW_REVIEWER},
        "tenant": {
            "partyName": "TenantPrepared",
            "personality": (
                "An excellent tenant who submits flawless documents within 4 hours. "
                "Approved on the first try — but has to wait 65 hours for the landlord's "
                "review. Extremely frustrated by the wait. "
                "Gives the landlord very low availability feedback (65-hour review is "
                "unacceptable) but high fairness and requirement-clarity feedback "
                "(the landlord's decision was correct)."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-006",
        "landlord": {"partyName": "LandlordSlowReviewer", "personality": _LANDLORD_SLOW_REVIEWER},
        "tenant": {
            "partyName": "TenantAverage",
            "personality": (
                "An average tenant who takes 12 hours to upload documents and needs one "
                "re-submission after a rejection. Each review by the landlord takes "
                "60–70 hours. The process drags on for many days. "
                "Gives the landlord very low availability feedback and medium fairness "
                "feedback — the decisions were correct but the wait times are painful."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-007",
        "landlord": {"partyName": "LandlordSlowReviewer", "personality": _LANDLORD_SLOW_REVIEWER},
        "tenant": {
            "partyName": "TenantThorough",
            "personality": (
                "A meticulous tenant who spends 20 hours carefully preparing perfect "
                "documents. Approved on the first try — but waits 72 hours for the review. "
                "Notes the landlord's decisions are accurate but the wait times are "
                "unacceptable. Gives the landlord very low availability scores and "
                "high requirement-clarity scores."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-008",
        "landlord": {"partyName": "LandlordSlowReviewer", "personality": _LANDLORD_SLOW_REVIEWER},
        "tenant": {
            "partyName": "TenantTimePressed",
            "personality": (
                "A tenant with a tight move-in deadline who uploads documents within "
                "3 hours. The landlord's 68-hour review nearly blows the deadline. "
                "After one rejection and another 60-hour wait, the stress is enormous. "
                "Gives the landlord extremely low availability scores and medium fairness "
                "scores — the slow reviews caused near-deadline panic."
            ),
        },
    },

    # ════════════════════════════════════════════════════════════════════
    # LandlordPicky — 4 interactions
    # Expected: high responsiveness, normal reliability, LOW accuracy
    # ════════════════════════════════════════════════════════════════════

    {
        "interactionId": "RA-EVAL-009",
        "landlord": {"partyName": "LandlordPicky", "personality": _LANDLORD_PICKY},
        "tenant": {
            "partyName": "TenantPerfect",
            "personality": (
                "An exemplary tenant who submits perfectly formatted documents within "
                "3 hours. Even so, the picky landlord rejects twice for trivial reasons "
                "before approving on the third attempt. The tenant re-uploads each time "
                "within 6 hours. Gives the landlord very low requirement-clarity feedback "
                "(bar was arbitrary) and high availability feedback (very fast responses)."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-010",
        "landlord": {"partyName": "LandlordPicky", "personality": _LANDLORD_PICKY},
        "tenant": {
            "partyName": "TenantGood",
            "personality": (
                "A well-prepared tenant who uploads within 8 hours. The picky landlord "
                "rejects three times citing minor issues. The tenant re-submits each time "
                "within 12 hours. Gives the landlord very low requirement-clarity and "
                "fairness scores (criteria felt shifting and arbitrary); medium "
                "availability scores for the fast turnaround."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-011",
        "landlord": {"partyName": "LandlordPicky", "personality": _LANDLORD_PICKY},
        "tenant": {
            "partyName": "TenantAverageRenter",
            "personality": (
                "An average tenant who takes 16 hours to upload each document. The picky "
                "landlord rejects twice. After each rejection, the tenant takes 16–20 "
                "hours to re-upload. Gives the landlord low fairness and "
                "requirement-clarity scores and medium availability scores."
            ),
        },
    },
    {
        "interactionId": "RA-EVAL-012",
        "landlord": {"partyName": "LandlordPicky", "personality": _LANDLORD_PICKY},
        "tenant": {
            "partyName": "TenantNewRenter",
            "personality": (
                "A first-time renter who struggles to understand the requirements. Takes "
                "24 hours to upload each time. The picky landlord rejects three times; "
                "the tenant has no idea what to fix and eventually gets help. "
                "Gives the landlord very low requirement-clarity and fairness scores "
                "and medium availability scores."
            ),
        },
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
- transaction_outcome: always "SELL_CLOSED"
- agent_feedback_about_buyer (AGENT rates THE BUYER):
    professionalism: float 0.0–1.0 — how professional and reliable was THE BUYER
    availability:    float 0.0–1.0 — how fast and responsive was THE BUYER
                     (buyer responded in 1h → near 1.0; buyer took 72h → near 0.1)
    honesty:         float 0.0–1.0 — how honest and accurate was THE BUYER
- buyer_feedback_about_agent (BUYER rates THE AGENT):
    professionalism: float 0.0–1.0 — how professional and reliable was THE AGENT
                     (agent who voided a contract scores lower)
    availability:    float 0.0–1.0 — how fast and responsive was THE AGENT
                     (agent uploaded contract in 4h → near 1.0; took 72h → near 0.0)
    honesty:         float 0.0–1.0 — how honest and accurate were THE AGENT's proposals
                     (first-try approval → near 1.0; 3 rejections needed → near 0.2)

SCORING CONTEXT:
- Responsiveness cap is 24h — times above 24h score near 0.0
- Agent reliability = transaction completed × penalty for voided contracts
- Agent accuracy = ratio of first-try approved proposals to total proposals

Return JSON matching this exact shape:
{
  "proposals": [{"buyer_response_hours": int, "outcome": "approved"|"rejected"}],
  "contract_upload_hours": int,
  "voided_contracts": int,
  "void_to_reupload_hours": int,
  "contract_signing_hours": int,
  "transaction_outcome": "SELL_CLOSED",
  "agent_feedback_about_buyer": {"professionalism": float, "availability": float, "honesty": float},
  "buyer_feedback_about_agent": {"professionalism": float, "availability": float, "honesty": float}
}
"""

RA_SYSTEM_PROMPT = """
You are a simulation parameter generator for a real-estate reputation system.
Convert personality descriptions into concrete numeric interaction parameters.
Return ONLY valid JSON — no markdown, no explanation.

CRITICAL RULE FOR FEEDBACK SCORES:
Feedback scores measure THE OTHER PARTY'S behaviour — NOT the rater's own behaviour.
  - landlord_feedback_about_tenant: the LANDLORD rates THE TENANT's behaviour.
  - tenant_feedback_about_landlord: the TENANT rates THE LANDLORD's behaviour.

Example: A well-prepared tenant paired with a slow landlord must:
  → receive HIGH document_honesty from the landlord (tenant's documents were good)
  → give LOW availability to the landlord (landlord's reviews took 70 hours)
Never mix up the direction.

RENTAL AGREEMENT INTERACTION SCHEMA:
- documents: list of upload+review cycles:
    - upload_hours: int (1–48) — hours after start (or prior event) before tenant uploads
    - landlord_review_hours: int (1–96) — hours for landlord to review
    - outcome: "approved" | "rejected"
  If "rejected", the next entry is the tenant re-uploading. Last entry must be "approved".
  Generate 1–4 entries total.
- final_event: always "LEASE_SIGNED"
- landlord_feedback_about_tenant (LANDLORD rates THE TENANT):
    document_honesty:         float 0.0–1.0 — were THE TENANT's documents accurate/complete
    communication_timeliness: float 0.0–1.0 — how fast did THE TENANT upload and respond
                              (tenant uploaded in 2h → near 1.0; took 48h → near 0.1)
    requirement_compliance:   float 0.0–1.0 — did THE TENANT follow the stated requirements
- tenant_feedback_about_landlord (TENANT rates THE LANDLORD):
    fairness:             float 0.0–1.0 — were THE LANDLORD's decisions fair and consistent
                          (picky/arbitrary rejections → near 0.1; fair bar → near 1.0)
    availability:         float 0.0–1.0 — how fast did THE LANDLORD review submissions
                          (reviewed in 4h → near 1.0; took 72h → near 0.0)
    requirement_clarity:  float 0.0–1.0 — were THE LANDLORD's requirements clear and stable
                          (kept changing criteria → near 0.1; clear rules → near 1.0)

SCORING CONTEXT:
- Responsiveness cap is 24h
- Landlord reliability = evaluatedDocs / uploadedDocs
- Landlord accuracy = firstRoundApprovals / approvedDocs (picky landlord scores low)
- Tenant reliability = lease completed without abandonment

Return JSON matching this exact shape:
{
  "documents": [{"upload_hours": int, "landlord_review_hours": int, "outcome": "approved"|"rejected"}],
  "final_event": "LEASE_SIGNED",
  "landlord_feedback_about_tenant": {"document_honesty": float, "communication_timeliness": float, "requirement_compliance": float},
  "tenant_feedback_about_landlord": {"fairness": float, "availability": float, "requirement_clarity": float}
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


def generate_ra_params(client, model_name: str, profile: dict) -> dict:
    landlord_p = profile["landlord"]["personality"]
    tenant_p = profile["tenant"]["personality"]
    user_msg = f"Landlord personality: {landlord_p}\n\nTenant personality: {tenant_p}"
    print(f"  Calling Gemini for {profile['interactionId']}...", end=" ", flush=True)
    result = call_gemini(client, model_name, RA_SYSTEM_PROMPT, user_msg)
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
# 5. DAML SCRIPT GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

DAML_HEADER = """\
module Scripts.EvalSeed where

import Daml.Script
import DA.Time (time)
import DA.Date (date, Month(..))
import DA.Text (isPrefixOf)

import Reputation.PropertyPurchase.Configuration (PropertyPurchaseConfiguration(..))
import Reputation.PropertyPurchase.Configuration qualified as PP
import Reputation.RentalAgreement.Configuration (RentalAgreementConfiguration(..))
import Reputation.RentalAgreement.Configuration qualified as RA
import Reputation.Role.Configuration (RoleConfiguration(..), CreateRole(..))
import Reputation.Interaction.Draft (DraftInteraction(..), Begin(..))
import Reputation.Interaction.InProgress (RecordEvent(..), Complete(..))
import Reputation.Interface.Configuration qualified as Configuration (I)
import Reputation.Types
import Reputation.PropertyPurchase.Feedback (PropertyPurchaseFeedbackRequest, SubmitFeedback(..))
import Reputation.RentalAgreement.FeedbackRequest (RentalAgreementFeedbackRequest, SubmitFeedbackAsLandlord(..), SubmitFeedbackAsTenant(..))

evalSeed : Script ()
evalSeed = do

  -- ── Parties ────────────────────────────────────────────────────────────
  knownParties <- listKnownParties
  operator <- case find (\\pd -> "Operator::" `isPrefixOf` (partyToText pd.party)) knownParties of
    None -> fail "Operator party not found. Run Setup first."
    Some pd -> pure pd.party

"""


def build_party_allocations(pp_profiles: list, ra_profiles: list) -> str:
    parties = set()
    for p in pp_profiles:
        parties.add(p["agent"]["partyName"])
        parties.add(p["buyer"]["partyName"])
    for p in ra_profiles:
        parties.add(p["landlord"]["partyName"])
        parties.add(p["tenant"]["partyName"])
    lines = []
    for party in sorted(parties):
        var = to_daml_var(party)
        lines.append(f'  {var} <- allocateParty "{party}"')
    return "\n".join(lines)


def build_config_block(pp_profiles: list, ra_profiles: list) -> str:
    roles: dict[str, str] = {}
    for p in pp_profiles:
        roles[p["agent"]["partyName"]] = "Agent"
        roles[p["buyer"]["partyName"]] = "Buyer"
    for p in ra_profiles:
        roles[p["landlord"]["partyName"]] = "Landlord"
        roles[p["tenant"]["partyName"]] = "Tenant"

    lines = []
    lines.append("  let t0 = time (date 2026 Jun 1) 0 0 0")
    lines.append("")
    lines.append("  -- ── Role configuration ───────────────────────────────────────────")
    lines.append("  roleConfigCid <- submit operator do")
    lines.append("    createCmd RoleConfiguration with")
    lines.append("      operator")
    lines.append('      configId        = "EVAL-ROLE-CONFIG"')
    lines.append("      createdAt       = t0")
    lines.append("      agentWeights    = AgentWeights    with reliability = 0.5; responsiveness = 0.3; accuracy = 0.2")
    lines.append("      buyerWeights    = BuyerWeights    with reliability = 0.5; responsiveness = 0.3; accuracy = 0.2")
    lines.append("      landlordWeights = LandlordWeights with reliability = 0.5; responsiveness = 0.3; accuracy = 0.2")
    lines.append("      tenantWeights   = TenantWeights   with reliability = 0.5; responsiveness = 0.3; accuracy = 0.2")
    lines.append("      scoreFloor      = 0.0")
    lines.append("      scoreCeiling    = 100.0")
    lines.append("      startValue      = 70.0")
    lines.append("")

    for party in sorted(roles.keys()):
        var = to_daml_var(party)
        role = roles[party]
        lines.append(
            f"  _ <- submit operator do exerciseCmd roleConfigCid CreateRole with"
            f" party = {var}; roleType = {role}; assignedAt = t0"
        )
    lines.append("")

    lines.append("  -- ── Property purchase configuration ──────────────────────────────")
    lines.append("  ppConfigCid <- submit operator do")
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
    lines.append("  let iPPConfigCid : ContractId Configuration.I = toInterfaceContractId ppConfigCid")
    lines.append("")
    lines.append("  -- ── Rental agreement configuration ───────────────────────────────")
    lines.append("  raConfigCid <- submit operator do")
    lines.append("    createCmd RentalAgreementConfiguration with")
    lines.append("      operator")
    lines.append('      configId   = "EVAL-RA-CONFIG"')
    lines.append("      createdAt  = t0")
    lines.append("      landlordObsWeights = LandlordObservationWeights with")
    lines.append("        responsivenessCapHours = 24.0")
    lines.append("      tenantObsWeights = TenantObservationWeights with")
    lines.append("        responsivenessFirstUploadWeight = 0.4")
    lines.append("        responsivenessReuploadWeight    = 0.6")
    lines.append("        responsivenessCapHours          = 24.0")
    lines.append("      feedbackWindowDays = 30")
    lines.append("")
    lines.append("  let iRAConfigCid : ContractId Configuration.I = toInterfaceContractId raConfigCid")
    lines.append("")

    return "\n".join(lines)


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

    # Build proposal timeline
    cursor = base_date
    proposal_times = []
    for proposal in params["proposals"]:
        t_submit = cursor
        cursor += timedelta(hours=proposal["buyer_response_hours"])
        proposal_times.append((t_submit, cursor, proposal["outcome"]))

    # Build contract upload / void / re-upload chain
    t_uploads: list[datetime] = []
    t_voids: list[datetime] = []

    cursor += timedelta(hours=params["contract_upload_hours"])
    t_uploads.append(cursor)
    for _ in range(voided):
        t_void = cursor + timedelta(hours=4)
        t_voids.append(t_void)
        cursor = t_void + timedelta(hours=void_hours)
        t_uploads.append(cursor)

    t_contract_sign = t_uploads[-1] + timedelta(hours=params["contract_signing_hours"])
    t_close = t_contract_sign + timedelta(hours=1)
    t_complete = t_close + timedelta(hours=1)
    t_feedback = t_complete + timedelta(hours=24)

    # Timestamps let block
    lines.append(f"  let {var}_t0 = {fmt_time(base_date)}")
    for i, (t_sub, t_res, _) in enumerate(proposal_times):
        lines.append(f"      {var}_p{i+1}_submit  = {fmt_time(t_sub)}")
        lines.append(f"      {var}_p{i+1}_respond = {fmt_time(t_res)}")
    for i, t_up in enumerate(t_uploads):
        lines.append(f"      {var}_cu{i+1}          = {fmt_time(t_up)}")
    for i, t_void in enumerate(t_voids):
        lines.append(f"      {var}_cv{i+1}          = {fmt_time(t_void)}")
    lines.append(f"      {var}_contract_sign   = {fmt_time(t_contract_sign)}")
    lines.append(f"      {var}_close    = {fmt_time(t_close)}")
    lines.append(f"      {var}_complete = {fmt_time(t_complete)}")
    lines.append(f"      {var}_feedback = {fmt_time(t_feedback)}")
    lines.append("")

    # Draft
    lines.append(f"  {var}_draftCid <- submit operator do")
    lines.append(f"    createCmd DraftInteraction with")
    lines.append(f"      operator; initiator = operator")
    lines.append(f"      interactionId = \"{interaction_id}\"")
    lines.append(f"      interactionType = \"PropertyPurchase\"")
    lines.append(f"      participants = [({agent_var}, Agent), ({buyer_var}, Buyer)]")
    lines.append(f"      openedAt = {var}_t0")
    lines.append("")

    # Begin
    lines.append(f"  {var}_ipCid <- submit operator do")
    lines.append(f"    exerciseCmd {var}_draftCid Begin with startedAt = {var}_t0; configCid = iPPConfigCid")
    lines.append("")

    # Proposal rounds
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

    # Contract upload / void / re-upload chain
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

    # Both parties sign the final contract
    final_c = len(t_uploads)
    for signer_var in [agent_var, buyer_var]:
        lines.append(f"  {var}_ipCid <- submit operator do")
        lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
        lines.append(f"      event = RecordedEvent with")
        lines.append(f"        event = ContractSigned; actor = {signer_var}; occurredAt = {var}_contract_sign")
        lines.append(f"        resourceId = Some \"contract-{final_c:03}\"")
        lines.append("")

    # Close
    lines.append(f"  {var}_ipCid <- submit operator do")
    lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
    lines.append(f"      event = RecordedEvent with")
    lines.append(f"        event = TransactionStateChanged; actor = {agent_var}; occurredAt = {var}_close")
    lines.append(f"        resourceId = Some \"SELL_CLOSED\"")
    lines.append("")

    # Complete
    lines.append(f"  {var}_completedCid <- submit operator do")
    lines.append(f"    exerciseCmd {var}_ipCid Complete with completedAt = {var}_complete")
    lines.append("")

    # CreateObservations
    lines.append(f"  (_, {var}_reqs) <- submit operator do")
    lines.append(f"    exerciseCmd ppConfigCid PP.CreateObservations with completedCid = {var}_completedCid")
    lines.append("")
    lines.append(f"  let [{var}_agentReq, {var}_buyerReq] = {var}_reqs")
    lines.append("")

    # Agent → buyer feedback
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

    # Buyer → agent feedback
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


def generate_ra_daml(profile: dict, params: dict, base_date: datetime) -> str:
    interaction_id = profile["interactionId"]
    landlord_party = profile["landlord"]["partyName"]
    tenant_party = profile["tenant"]["partyName"]
    landlord_var = to_daml_var(landlord_party)
    tenant_var = to_daml_var(tenant_party)
    var = interaction_id.replace("-", "_").lower()

    lines = []
    lines.append(f"  -- ═══════════════════════════════════════════════════════════")
    lines.append(f"  -- {interaction_id}: {landlord_party} (Landlord) + {tenant_party} (Tenant)")
    lines.append(f"  -- ═══════════════════════════════════════════════════════════")

    cursor = base_date
    doc_times = []
    for doc in params["documents"]:
        cursor += timedelta(hours=doc["upload_hours"])
        t_upload = cursor
        cursor += timedelta(hours=doc["landlord_review_hours"])
        doc_times.append((t_upload, cursor, doc["outcome"]))

    t_lease = cursor + timedelta(hours=2)
    t_complete = t_lease + timedelta(hours=1)
    t_feedback = t_complete + timedelta(hours=24)

    lines.append(f"  let {var}_t0 = {fmt_time(base_date)}")
    for i, (t_up, t_rev, _) in enumerate(doc_times):
        lines.append(f"      {var}_d{i+1}_upload = {fmt_time(t_up)}")
        lines.append(f"      {var}_d{i+1}_review = {fmt_time(t_rev)}")
    lines.append(f"      {var}_lease    = {fmt_time(t_lease)}")
    lines.append(f"      {var}_complete = {fmt_time(t_complete)}")
    lines.append(f"      {var}_feedback = {fmt_time(t_feedback)}")
    lines.append("")

    # Draft
    lines.append(f"  {var}_draftCid <- submit operator do")
    lines.append(f"    createCmd DraftInteraction with")
    lines.append(f"      operator; initiator = operator")
    lines.append(f"      interactionId = \"{interaction_id}\"")
    lines.append(f"      interactionType = \"RentalAgreement\"")
    lines.append(f"      participants = [({landlord_var}, Landlord), ({tenant_var}, Tenant)]")
    lines.append(f"      openedAt = {var}_t0")
    lines.append("")

    # Begin
    lines.append(f"  {var}_ipCid <- submit operator do")
    lines.append(f"    exerciseCmd {var}_draftCid Begin with startedAt = {var}_t0; configCid = iRAConfigCid")
    lines.append("")

    # Document events
    doc_num = 1
    for i, (t_up, t_rev, outcome) in enumerate(doc_times):
        resource = f"doc-{doc_num:03}"
        lines.append(f"  {var}_ipCid <- submit operator do")
        lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
        lines.append(f"      event = RecordedEvent with")
        lines.append(f"        event = DocumentUploaded; actor = {tenant_var}; occurredAt = {var}_d{i+1}_upload")
        lines.append(f"        resourceId = Some \"{resource}\"")
        lines.append("")
        if outcome == "rejected":
            lines.append(f"  {var}_ipCid <- submit operator do")
            lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
            lines.append(f"      event = RecordedEvent with")
            lines.append(f"        event = DocumentRejectedWithNotes; actor = {landlord_var}; occurredAt = {var}_d{i+1}_review")
            lines.append(f"        resourceId = Some \"{resource}\"")
            lines.append("")
        else:
            lines.append(f"  {var}_ipCid <- submit operator do")
            lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
            lines.append(f"      event = RecordedEvent with")
            lines.append(f"        event = DocumentApproved; actor = {landlord_var}; occurredAt = {var}_d{i+1}_review")
            lines.append(f"        resourceId = Some \"{resource}\"")
            lines.append("")
            doc_num += 1

    # Lease signed
    lines.append(f"  {var}_ipCid <- submit operator do")
    lines.append(f"    exerciseCmd {var}_ipCid RecordEvent with")
    lines.append(f"      event = RecordedEvent with")
    lines.append(f"        event = TransactionStateChanged; actor = {landlord_var}; occurredAt = {var}_lease")
    lines.append(f"        resourceId = Some \"LEASE_SIGNED\"")
    lines.append("")

    # Complete
    lines.append(f"  {var}_completedCid <- submit operator do")
    lines.append(f"    exerciseCmd {var}_ipCid Complete with completedAt = {var}_complete")
    lines.append("")

    # CreateObservations
    lines.append(f"  (_, {var}_reqs) <- submit operator do")
    lines.append(f"    exerciseCmd raConfigCid RA.CreateObservations with completedCid = {var}_completedCid")
    lines.append("")
    lines.append(f"  let [{var}_landlordReq, {var}_tenantReq] = {var}_reqs")
    lines.append("")

    # Landlord → tenant feedback
    fb_lt = params["landlord_feedback_about_tenant"]
    lines.append(f"  -- {landlord_party} (landlord) gives feedback about {tenant_party} (tenant)")
    lines.append(f"  submit {landlord_var} do")
    lines.append(f"    exerciseCmd (fromInterfaceContractId {var}_landlordReq : ContractId RentalAgreementFeedbackRequest)")
    lines.append(f"      SubmitFeedbackAsLandlord with")
    lines.append(f"        documentHonesty         = {fmt_decimal(fb_lt['document_honesty'])}")
    lines.append(f"        communicationTimeliness = {fmt_decimal(fb_lt['communication_timeliness'])}")
    lines.append(f"        requirementCompliance   = {fmt_decimal(fb_lt['requirement_compliance'])}")
    lines.append(f"        submittedAt = {var}_feedback")
    lines.append("")

    # Tenant → landlord feedback
    fb_tl = params["tenant_feedback_about_landlord"]
    lines.append(f"  -- {tenant_party} (tenant) gives feedback about {landlord_party} (landlord)")
    lines.append(f"  submit {tenant_var} do")
    lines.append(f"    exerciseCmd (fromInterfaceContractId {var}_tenantReq : ContractId RentalAgreementFeedbackRequest)")
    lines.append(f"      SubmitFeedbackAsTenant with")
    lines.append(f"        fairness           = {fmt_decimal(fb_tl['fairness'])}")
    lines.append(f"        availability       = {fmt_decimal(fb_tl['availability'])}")
    lines.append(f"        requirementClarity = {fmt_decimal(fb_tl['requirement_clarity'])}")
    lines.append(f"        submittedAt = {var}_feedback")
    lines.append("")

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# 6. FULL SCRIPT ASSEMBLY
# ─────────────────────────────────────────────────────────────────────────────

def assemble_daml_script(
    pp_profiles: list,
    pp_params_list: list,
    ra_profiles: list,
    ra_params_list: list,
) -> str:
    parts = [DAML_HEADER]
    parts.append(build_party_allocations(pp_profiles, ra_profiles))
    parts.append("\n")
    parts.append(build_config_block(pp_profiles, ra_profiles))

    parts.append("  -- ══════════════════════════════════════════════════════════════════")
    parts.append("  -- PROPERTY PURCHASE INTERACTIONS")
    parts.append("  -- ══════════════════════════════════════════════════════════════════\n")

    base = datetime(2026, 6, 1, 9, 0, 0)
    for profile, params in zip(pp_profiles, pp_params_list):
        parts.append(generate_pp_daml(profile, params, base))
        base += timedelta(days=60)

    parts.append("  -- ══════════════════════════════════════════════════════════════════")
    parts.append("  -- RENTAL AGREEMENT INTERACTIONS")
    parts.append("  -- ══════════════════════════════════════════════════════════════════\n")

    base = datetime(2026, 6, 1, 9, 0, 0)
    for profile, params in zip(ra_profiles, ra_params_list):
        parts.append(generate_ra_daml(profile, params, base))
        base += timedelta(days=60)

    parts.append("  pure ()")
    parts.append("")
    return "\n".join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# 7. JSON PARAMS REPORT
# ─────────────────────────────────────────────────────────────────────────────

def dump_params_report(pp_profiles, pp_params, ra_profiles, ra_params) -> str:
    report = {"property_purchase": [], "rental_agreement": []}
    for profile, params in zip(pp_profiles, pp_params):
        report["property_purchase"].append({
            "interactionId": profile["interactionId"],
            "agent": profile["agent"]["partyName"],
            "buyer": profile["buyer"]["partyName"],
            "generated_parameters": params,
        })
    for profile, params in zip(ra_profiles, ra_params):
        report["rental_agreement"].append({
            "interactionId": profile["interactionId"],
            "landlord": profile["landlord"]["partyName"],
            "tenant": profile["tenant"]["partyName"],
            "generated_parameters": params,
        })
    return json.dumps(report, indent=2)


# ─────────────────────────────────────────────────────────────────────────────
# 8. ENTRYPOINT
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AI Agent Simulation for Reputation System Evaluation")
    parser.add_argument("--output", default="EvalSeed.daml", help="Output DAML file path")
    parser.add_argument("--model", required=True, help="Gemini model to use (e.g. gemini-2.0-flash)")
    args = parser.parse_args()

    pp_count = len(PROPERTY_PURCHASE_PERSONALITIES)
    ra_count = len(RENTAL_AGREEMENT_PERSONALITIES)

    n_agents    = len({p["agent"]["partyName"]    for p in PROPERTY_PURCHASE_PERSONALITIES})
    n_buyers    = len({p["buyer"]["partyName"]    for p in PROPERTY_PURCHASE_PERSONALITIES})
    n_landlords = len({p["landlord"]["partyName"] for p in RENTAL_AGREEMENT_PERSONALITIES})
    n_tenants   = len({p["tenant"]["partyName"]   for p in RENTAL_AGREEMENT_PERSONALITIES})

    print(f"Reputation System — AI Agent Evaluation Simulator")
    print(f"Model : {args.model}")
    print(f"PP interactions : {pp_count}  ({n_agents} agents × 4, {n_buyers} unique buyers)")
    print(f"RA interactions : {ra_count}  ({n_landlords} landlords × 4, {n_tenants} unique tenants)")
    print()
    print("Agent archetypes:")
    print("  AgentPro          — high reliability, high responsiveness, high accuracy")
    print("  AgentSlowUploader — high accuracy, LOW responsiveness, normal reliability")
    print("  AgentHighReject   — high responsiveness, normal reliability, LOW accuracy")
    print("  AgentVoider       — LOW reliability (voids), medium responsiveness, medium accuracy")
    print("Landlord archetypes:")
    print("  LandlordFair         — high reliability, high responsiveness, high accuracy")
    print("  LandlordSlowReviewer — high accuracy, LOW responsiveness, normal reliability")
    print("  LandlordPicky        — high responsiveness, normal reliability, LOW accuracy")
    print()

    gemini_client = genai.Client(
        vertexai=True, project="agisit-2025-proj-99123", location="global",
    )

    print("Generating Property Purchase interaction parameters...")
    pp_params = [generate_pp_params(gemini_client, args.model, p) for p in PROPERTY_PURCHASE_PERSONALITIES]

    print("\nGenerating Rental Agreement interaction parameters...")
    ra_params = [generate_ra_params(gemini_client, args.model, p) for p in RENTAL_AGREEMENT_PERSONALITIES]

    print("\nAssembling DAML script...")
    daml = assemble_daml_script(
        PROPERTY_PURCHASE_PERSONALITIES, pp_params,
        RENTAL_AGREEMENT_PERSONALITIES, ra_params,
    )

    with open(args.output, "w") as f:
        f.write(daml)
    print(f"  DAML script written to  : {args.output}")
    print()

if __name__ == "__main__":
    main()
