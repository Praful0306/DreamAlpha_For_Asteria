"""
One-time script: fully configure Omnidim ASHA Health Agent (ID 149113)
- Creates all 6 tool integrations
- Links them to the agent
- Updates persona, welcome message, and enables call transfer
"""
import json
from omnidimension import Client

API_KEY  = "sNL3bHv3gjMlRwl_dXGB2ZHkLi1DAfPyGVBWDIQXIgk"
AGENT_ID = 149113
BASE_URL = "https://dreamalpha-for-amd.onrender.com"
WEBHOOK  = f"{BASE_URL}/omnidim/asha-health-call"

c = Client(API_KEY)

# ── 1. Define all tools ───────────────────────────────────────────────────────
TOOLS = [
    {
        "name":        "identify_patient",
        "description": "Look up a patient by their phone number and return their name, health summary, and risk level.",
        "url":         f"{WEBHOOK}?tool=identify_patient",
        "stop_listening": False,
        "body_params": [
            {"key":"phone","description":"Patient mobile number (10 digits or with +91)","type":"string","required":True,"isLLMGenerated":True}
        ],
    },
    {
        "name":        "log_health_update",
        "description": "Save the patient health status — how they feel and any symptoms they mention.",
        "url":         f"{WEBHOOK}?tool=log_health_update",
        "stop_listening": False,
        "body_params": [
            {"key":"phone",       "description":"Patient mobile number","type":"string","required":True,"isLLMGenerated":True},
            {"key":"how_feeling", "description":"How the patient says they are feeling","type":"string","required":True,"isLLMGenerated":True},
            {"key":"symptoms",    "description":"Any symptoms the patient mentioned","type":"string","required":False,"isLLMGenerated":True},
        ],
    },
    {
        "name":        "request_asha_visit",
        "description": "Log a request for the ASHA worker to visit or call back the patient.",
        "url":         f"{WEBHOOK}?tool=request_asha_visit",
        "stop_listening": False,
        "body_params": [
            {"key":"phone",   "description":"Patient mobile number","type":"string","required":True,"isLLMGenerated":True},
            {"key":"reason",  "description":"Reason for visit or callback request","type":"string","required":False,"isLLMGenerated":True},
            {"key":"urgency", "description":"urgent or normal","type":"string","required":False,"isLLMGenerated":True},
        ],
    },
    {
        "name":        "get_health_advice",
        "description": "Return personalised health advice based on the patient medical history and current diagnosis.",
        "url":         f"{WEBHOOK}?tool=get_health_advice",
        "stop_listening": False,
        "body_params": [
            {"key":"phone","description":"Patient mobile number","type":"string","required":True,"isLLMGenerated":True}
        ],
    },
    {
        "name":        "get_patient_for_asha",
        "description": "Used at call start when ASHA triggers the call — greet the patient by name and explain the call purpose.",
        "url":         f"{WEBHOOK}?tool=get_patient_for_asha",
        "stop_listening": False,
        "body_params": [
            {"key":"phone",     "description":"Patient mobile number","type":"string","required":True,"isLLMGenerated":True},
            {"key":"asha_name", "description":"Name of the ASHA worker who triggered the call","type":"string","required":False,"isLLMGenerated":True},
            {"key":"call_type", "description":"health_check, followup, emergency, or reminder","type":"string","required":False,"isLLMGenerated":True},
        ],
    },
    {
        "name":        "transfer_to_asha",
        "description": "When the patient asks to speak directly with their ASHA worker, call this to get the ASHA phone number for live call transfer.",
        "url":         f"{WEBHOOK}?tool=transfer_to_asha",
        "stop_listening": True,
        "body_params": [
            {"key":"phone","description":"Patient mobile number","type":"string","required":True,"isLLMGenerated":True}
        ],
    },
]

# ── 2. Create integrations ────────────────────────────────────────────────────
print("Creating integrations...")
integration_ids = []
for tool in TOOLS:
    stop = tool["stop_listening"]
    try:
        resp = c.integrations.create_custom_api_integration(
            name=tool["name"],
            url=tool["url"],
            method="POST",
            description=tool["description"],
            body_params=tool["body_params"],
            stop_listening=stop,
        )
        iid = resp["json"].get("id") or resp["json"].get("integration_id")
        integration_ids.append(int(iid))
        print(f"  OK '{tool['name']}' -> ID {iid}")
    except Exception as e:
        print(f"  FAIL '{tool['name']}': {e}")

print(f"\nIntegration IDs: {integration_ids}")

# ── 3. Link integrations to agent ────────────────────────────────────────────
print("\nLinking integrations to agent...")
for iid in integration_ids:
    try:
        c.integrations.add_integration_to_agent(AGENT_ID, iid)
        print(f"  Linked {iid}")
    except Exception as e:
        print(f"  Link {iid} error: {e}")

# ── 4. Update agent persona + enable transfer ─────────────────────────────────
print("\nUpdating agent...")
new_context = [
    {
        "title": "Agent Identity",
        "body": (
            "You are Sahayak, an AI health assistant calling on behalf of ASHA (Accredited Social Health Activist) workers "
            "in rural India. You speak in a warm, caring, simple manner. "
            "You can speak in Hindi or English based on what the patient prefers.\n\n"
            "IMPORTANT RULES:\n"
            "- Introduce yourself as calling on behalf of the ASHA worker.\n"
            "- Keep responses short - 2 to 3 sentences max.\n"
            "- Never use bullet points or formatted text.\n"
            "- If patient says transfer, connect ASHA, speak to ASHA, or ASHA se baat karni hai: "
            "call the transfer_to_asha tool immediately.\n"
            "- When transfer_to_asha returns a response containing TRANSFER_PHONE, "
            "extract the phone number and transfer the call to that number."
        )
    },
    {
        "title": "Health Check Flow",
        "body": (
            "Step 1: At call start, call get_patient_for_asha with the patient phone to greet them personally.\n"
            "Step 2: Ask how they are feeling today and if they have any symptoms.\n"
            "Step 3: Call log_health_update with their response.\n"
            "Step 4: If patient asks for advice, call get_health_advice.\n"
            "Step 5: If patient wants ASHA to visit, call request_asha_visit.\n"
            "Step 6: If patient wants to speak directly to ASHA, call transfer_to_asha and transfer to the returned number."
        )
    },
    {
        "title": "Call Transfer Instructions",
        "body": (
            "When patient says I want to speak to my ASHA worker, transfer me, connect me to ASHA, "
            "ASHA didi se baat karo, or similar:\n"
            "Say: Let me connect you to your ASHA worker. One moment please.\n"
            "Then call transfer_to_asha with the patient phone number.\n"
            "The response will contain TRANSFER_PHONE followed by the number.\n"
            "Transfer the call to that number immediately.\n"
            "If transfer is not possible, say: Your ASHA worker will call you back soon."
        )
    },
    {
        "title": "Language and Tone",
        "body": (
            "Speak simply and warmly like a caring community health worker. "
            "Use Hindi if patient speaks Hindi: "
            "Namaste, Aap kaise hain, Koi takleef hai, "
            "Main abhi aapko ASHA didi se connect karti hoon. "
            "Always end with: Apna khayal rakhiye meaning take care of yourself."
        )
    },
]

try:
    resp = c.agent.update(AGENT_ID, {
        "welcome_message": (
            "Namaste! Main Sahayak hoon, aapki ASHA worker ki taraf se bol rahi hoon. "
            "Hello! I am Sahayak, the AI health assistant calling on behalf of your ASHA worker. "
            "How are you feeling today?"
        ),
        "is_welcome_message_dynamic": True,
        "context_breakdown": [{"title": t["title"], "body": t["body"]} for t in new_context],
        "is_transfer_enabled": True,
        "is_custom_api_transfer_enabled": True,
        "transfer_options": [],
        "end_call_message": "Thank you for talking to Sahayak. Apna khayal rakhiye. Goodbye!",
        "end_call_condition": "End the call when the patient says goodbye, thank you, or the health check is complete.",
    })
    print(f"  Agent updated: status {resp['status']}")
    if resp.get("json"):
        print(f"  is_transfer_enabled: {resp['json'].get('is_transfer_enabled')}")
        print(f"  is_custom_api_transfer_enabled: {resp['json'].get('is_custom_api_transfer_enabled')}")
        print(f"  integrations count: {len(resp['json'].get('integrations', []))}")
except Exception as e:
    print(f"  Agent update FAILED: {e}")

print("\nDone! Agent 149113 fully configured.")
