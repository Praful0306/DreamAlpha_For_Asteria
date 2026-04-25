"""
One-time script: configure Omnidim Appointment Booking Agent (ID 149053)
"""
from omnidimension import Client
import json

API_KEY  = "sNL3bHv3gjMlRwl_dXGB2ZHkLi1DAfPyGVBWDIQXIgk"
AGENT_ID = 149053
BASE_URL = "https://dreamalpha-for-amd.onrender.com"
WEBHOOK  = f"{BASE_URL}/omnidim/tool-call"

c = Client(API_KEY)

TOOLS = [
    {
        "name": "register_patient",
        "description": "Register a new patient or find an existing one by phone number. Call this after collecting the patient full name, phone number, and age.",
        "body_params": [
            {"key":"full_name",  "description":"Patient full name","type":"string","required":True, "isLLMGenerated":True},
            {"key":"phone",      "description":"Patient 10-digit mobile number","type":"string","required":True, "isLLMGenerated":True},
            {"key":"age",        "description":"Patient age in years","type":"number","required":False,"isLLMGenerated":True},
        ],
    },
    {
        "name": "lookup_patient_id",
        "description": "Look up an existing patient by their phone number to get their Sahayak Patient ID.",
        "body_params": [
            {"key":"phone","description":"Patient mobile number","type":"string","required":True,"isLLMGenerated":True},
        ],
    },
    {
        "name": "get_available_slots",
        "description": "Get available appointment time slots for the doctor on a given date.",
        "body_params": [
            {"key":"date",      "description":"Appointment date in YYYY-MM-DD format","type":"string","required":False,"isLLMGenerated":True},
            {"key":"doctor_id", "description":"Doctor ID (use 1 if not specified)","type":"number","required":False,"isLLMGenerated":False},
        ],
    },
    {
        "name": "book_appointment",
        "description": "Book a confirmed appointment for the patient. Call this after confirming name, phone, date, and time slot with the patient.",
        "body_params": [
            {"key":"patient_name",  "description":"Patient full name","type":"string","required":True, "isLLMGenerated":True},
            {"key":"phone",         "description":"Patient mobile number","type":"string","required":True, "isLLMGenerated":True},
            {"key":"date",          "description":"Appointment date YYYY-MM-DD","type":"string","required":True, "isLLMGenerated":True},
            {"key":"time_slot",     "description":"Time slot in HH:MM format e.g. 09:30","type":"string","required":True, "isLLMGenerated":True},
            {"key":"reason",        "description":"Reason for the appointment","type":"string","required":False,"isLLMGenerated":True},
            {"key":"doctor_id",     "description":"Doctor ID (use 1 if not specified)","type":"number","required":False,"isLLMGenerated":False},
        ],
    },
]

print("Creating integrations for appointment agent...")
integration_ids = []
for tool in TOOLS:
    try:
        url = f"{WEBHOOK}?tool={tool['name']}"
        resp = c.integrations.create_custom_api_integration(
            name=tool["name"],
            url=url,
            method="POST",
            description=tool["description"],
            body_params=tool["body_params"],
            stop_listening=False,
        )
        iid = resp["json"].get("id") or resp["json"].get("integration_id")
        integration_ids.append(int(iid))
        print(f"  OK '{tool['name']}' -> ID {iid}")
    except Exception as e:
        print(f"  FAIL '{tool['name']}': {e}")

print(f"\nIntegration IDs: {integration_ids}")

print("\nLinking to agent 149053...")
for iid in integration_ids:
    try:
        c.integrations.add_integration_to_agent(AGENT_ID, iid)
        print(f"  Linked {iid}")
    except Exception as e:
        print(f"  Link {iid}: {e}")

print("\nUpdating agent persona...")
context = [
    {
        "title": "Agent Identity",
        "body": (
            "You are Sahayak Booking Assistant, an AI appointment scheduling assistant for Sahayak AI Health Clinic. "
            "You help patients register, check available slots, and book doctor appointments by phone. "
            "Speak clearly, warmly, and simply — patients may be elderly or from rural areas. "
            "You can speak in Hindi or English based on patient preference.\n\n"
            "BOOKING FLOW:\n"
            "1. Greet the patient warmly.\n"
            "2. Ask: Are you a new patient or returning patient?\n"
            "   - New patient: Ask for full name, phone number, and age. Then call register_patient.\n"
            "   - Returning patient: Ask for phone number. Call lookup_patient_id.\n"
            "3. Ask for preferred appointment date (today or a specific date).\n"
            "4. Call get_available_slots to find free times.\n"
            "5. Tell patient the available times and ask which they prefer.\n"
            "6. Confirm: name, date, and time with patient.\n"
            "7. Call book_appointment to confirm the slot.\n"
            "8. Read out the appointment reference number and say goodbye."
        )
    },
    {
        "title": "Conflict Prevention",
        "body": (
            "The system automatically checks for conflicts. "
            "If a slot is already booked, the system will tell you and suggest alternatives. "
            "Always confirm the final slot with the patient before calling book_appointment. "
            "Never book the same slot twice — the system will reject duplicates."
        )
    },
    {
        "title": "Language and Tone",
        "body": (
            "Speak simply and warmly. For Hindi: "
            "Namaste, Mera naam Sahayak Booking Assistant hai. "
            "Aap naya appointment book karna chahte hain? "
            "Always end with: Dhanyavaad, aapka din shubh ho meaning Thank you, have a great day."
        )
    },
]

try:
    resp = c.agent.update(AGENT_ID, {
        "welcome_message": (
            "Namaste! Sahayak Health Clinic mein aapka swagat hai. "
            "Hello! Welcome to Sahayak Health Clinic. "
            "I am your AI booking assistant. "
            "Are you a new patient or would you like to book an appointment for an existing record?"
        ),
        "is_welcome_message_dynamic": True,
        "context_breakdown": [{"title": t["title"], "body": t["body"]} for t in context],
        "end_call_message": "Your appointment has been confirmed. Thank you for calling Sahayak Health Clinic. Goodbye!",
        "end_call_condition": "End the call after the appointment is confirmed and the reference number is given, or if patient says goodbye.",
    })
    print(f"  Agent updated: {resp['status']}")
    r2 = c.agent.get(AGENT_ID)
    print(f"  Integration IDs on agent: {r2['json'].get('integration_ids')}")
    print(f"  Integrations count: {len(r2['json'].get('integrations', []))}")
    print(f"  Welcome: {r2['json'].get('welcome_message','')[:80]}")
except Exception as e:
    print(f"  Update FAILED: {e}")

print("\nDone! Agent 149053 configured.")
