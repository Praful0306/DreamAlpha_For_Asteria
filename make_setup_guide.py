"""
Sahayak AI — Make.com + VAPI Setup Guide Generator
Creates a professional PDF with all step-by-step instructions.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# ── Output path ───────────────────────────────────────────────────────────────
OUTPUT = "E:/CLAUDE_AMD_PROJECT/Sahayak_AI_MakeCom_VAPI_Setup_Guide.pdf"

# ── Colours ───────────────────────────────────────────────────────────────────
ORANGE   = colors.HexColor("#f97316")
DARK_BG  = colors.HexColor("#1a1a22")
GRAY     = colors.HexColor("#6b7280")
LIGHT_BG = colors.HexColor("#f9fafb")
GREEN    = colors.HexColor("#16a34a")
BLUE     = colors.HexColor("#2563eb")
RED      = colors.HexColor("#dc2626")
PURPLE   = colors.HexColor("#7c3aed")
WHITE    = colors.white
BLACK    = colors.HexColor("#111827")

def build_styles():
    base = getSampleStyleSheet()

    styles = {
        "cover_title": ParagraphStyle("cover_title",
            fontSize=28, fontName="Helvetica-Bold",
            textColor=WHITE, alignment=TA_CENTER, leading=36),

        "cover_sub": ParagraphStyle("cover_sub",
            fontSize=13, fontName="Helvetica",
            textColor=colors.HexColor("#fcd34d"), alignment=TA_CENTER, leading=20),

        "cover_note": ParagraphStyle("cover_note",
            fontSize=10, fontName="Helvetica",
            textColor=colors.HexColor("#d1d5db"), alignment=TA_CENTER, leading=14),

        "section": ParagraphStyle("section",
            fontSize=16, fontName="Helvetica-Bold",
            textColor=ORANGE, spaceBefore=14, spaceAfter=6, leading=20),

        "subsection": ParagraphStyle("subsection",
            fontSize=12, fontName="Helvetica-Bold",
            textColor=BLACK, spaceBefore=10, spaceAfter=4, leading=16),

        "body": ParagraphStyle("body",
            fontSize=10, fontName="Helvetica",
            textColor=BLACK, leading=15, spaceAfter=4),

        "step_num": ParagraphStyle("step_num",
            fontSize=10, fontName="Helvetica-Bold",
            textColor=ORANGE, leading=14),

        "step_text": ParagraphStyle("step_text",
            fontSize=10, fontName="Helvetica",
            textColor=BLACK, leading=14, leftIndent=16),

        "code": ParagraphStyle("code",
            fontSize=8.5, fontName="Courier",
            textColor=colors.HexColor("#1e293b"),
            backColor=colors.HexColor("#f1f5f9"),
            leading=13, leftIndent=10, rightIndent=10,
            borderPadding=(4, 6, 4, 6)),

        "code_label": ParagraphStyle("code_label",
            fontSize=7.5, fontName="Helvetica-Bold",
            textColor=WHITE,
            backColor=colors.HexColor("#334155"),
            leading=11, leftIndent=10),

        "tip": ParagraphStyle("tip",
            fontSize=9.5, fontName="Helvetica",
            textColor=colors.HexColor("#065f46"),
            backColor=colors.HexColor("#d1fae5"),
            leading=13, leftIndent=10, rightIndent=10,
            borderPadding=(4, 6, 4, 6)),

        "warn": ParagraphStyle("warn",
            fontSize=9.5, fontName="Helvetica",
            textColor=colors.HexColor("#7c2d12"),
            backColor=colors.HexColor("#fee2e2"),
            leading=13, leftIndent=10, rightIndent=10,
            borderPadding=(4, 6, 4, 6)),

        "url": ParagraphStyle("url",
            fontSize=9, fontName="Courier",
            textColor=BLUE, leading=13),

        "footer": ParagraphStyle("footer",
            fontSize=8, fontName="Helvetica",
            textColor=GRAY, alignment=TA_CENTER),
    }
    return styles

def step(num, title, body_lines, S):
    """Build a single numbered step block."""
    items = []
    items.append(Paragraph(f"Step {num}: {title}", S["step_num"]))
    for line in body_lines:
        items.append(Paragraph(f"• {line}", S["step_text"]))
    items.append(Spacer(1, 4))
    return items

def code_block(label, lines, S):
    """Monospaced code block with a dark label."""
    items = []
    items.append(Paragraph(label, S["code_label"]))
    items.append(Paragraph("<br/>".join(lines), S["code"]))
    items.append(Spacer(1, 6))
    return items

def scenario_header(num, title, color, S):
    tbl = Table([[f"  SCENARIO {num}  ", title]], colWidths=[70*mm, 110*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,0), color),
        ("BACKGROUND", (1,0), (1,0), colors.HexColor("#f9fafb")),
        ("TEXTCOLOR",  (0,0), (0,0), WHITE),
        ("TEXTCOLOR",  (1,0), (1,0), BLACK),
        ("FONTNAME",   (0,0), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE",   (0,0), (-1,-1), 11),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [color, colors.HexColor("#f9fafb")]),
        ("LINEBELOW",  (0,0), (-1,-1), 1, color),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
    ]))
    return [tbl, Spacer(1, 8)]

def env_table(rows, S):
    """Two-column table for env variables."""
    data = [["Environment Variable", "Value / Where to get it"]] + rows
    col_widths = [80*mm, 100*mm]
    tbl = Table(data, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), DARK_BG),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME",      (0,1), (-1,-1), "Courier"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, colors.HexColor("#f8fafc")]),
        ("GRID",          (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ]))
    return [tbl, Spacer(1, 10)]

# ── Build PDF ─────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=14*mm, bottomMargin=14*mm
    )
    S = build_styles()
    story = []
    W = A4[0] - 36*mm  # usable width

    # ════════════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ════════════════════════════════════════════════════════════════════════
    cover_bg = Table([[""]],
        colWidths=[W + 36*mm], rowHeights=[100*mm])
    cover_bg.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), DARK_BG),
    ]))
    # We'll fake the cover with a table
    cover_data = [
        [Paragraph("🏥 Sahayak AI", S["cover_title"])],
        [Spacer(1, 4)],
        [Paragraph("Make.com + VAPI Integration", S["cover_sub"])],
        [Paragraph("Complete Step-by-Step Setup Guide", S["cover_sub"])],
        [Spacer(1, 8)],
        [Paragraph("Team DreamAlpha · AMD Slingshot Hackathon 2025", S["cover_note"])],
        [Paragraph("5 Scenarios · Real Phone Calls · SMS + Email Automation", S["cover_note"])],
    ]
    cover = Table(cover_data, colWidths=[W])
    cover.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), DARK_BG),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 20),
        ("RIGHTPADDING",  (0,0), (-1,-1), 20),
        ("ROUNDEDCORNERS",(0,0), (-1,-1), [8, 8, 8, 8]),
    ]))
    story.append(cover)
    story.append(Spacer(1, 10*mm))

    # Quick overview box
    overview_data = [[
        Paragraph("<b>What this guide sets up:</b><br/>"
                  "5 Make.com automation scenarios that connect your Sahayak AI frontend to "
                  "real SMS alerts, email notifications, and AI voice phone calls — "
                  "all without exposing API keys in the browser.", S["body"])
    ]]
    ov = Table(overview_data, colWidths=[W])
    ov.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#fff7ed")),
        ("LINERIGHT",     (0,0), (0,-1), 4, ORANGE),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 14),
    ]))
    story.append(ov)
    story.append(Spacer(1, 6*mm))

    # ════════════════════════════════════════════════════════════════════════
    # PART 0 — PREREQUISITES
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 0 — Prerequisites", S["section"]))
    story.append(HRFlowable(width=W, thickness=1, color=ORANGE))
    story.append(Spacer(1, 4))

    prereq_data = [
        ["Account / Service", "Plan Needed", "Get it at"],
        ["Make.com",          "$10/mo Core plan", "make.com"],
        ["VAPI",              "Free tier (trial minutes)", "vapi.ai"],
        ["MSG91 (SMS India)", "Pay-as-you-go (~₹0.18/SMS)", "msg91.com"],
        ["Gmail",             "Free Google account", "gmail.com"],
        ["Sahayak AI frontend", "Already set up", ".env.local file"],
    ]
    tbl = Table(prereq_data, colWidths=[60*mm, 50*mm, 70*mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), ORANGE),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME",      (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, LIGHT_BG]),
        ("GRID",          (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 6*mm))

    # ════════════════════════════════════════════════════════════════════════
    # PART 1 — VAPI ACCOUNT SETUP
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 1 — VAPI Account Setup", S["section"]))
    story.append(HRFlowable(width=W, thickness=1, color=ORANGE))
    story.append(Spacer(1, 4))
    story.append(Paragraph("Get your VAPI API keys and a phone number before building Make.com scenarios.", S["body"]))
    story.append(Spacer(1, 4))

    for s in step(1, "Create a VAPI account", [
        'Go to dashboard.vapi.ai and sign up (free tier available)',
        'Verify your email address',
    ], S): story.append(s)

    for s in step(2, "Get your API Keys", [
        'In VAPI dashboard → click "Account" (top-right) → "API Keys"',
        'Copy the PUBLIC KEY  →  used in frontend (not needed now — Make.com replaces it)',
        'Copy the PRIVATE KEY  →  paste into Make.com scenarios only (never in frontend!)',
    ], S): story.append(s)

    story.append(Paragraph("⚠  Keep your VAPI PRIVATE KEY secret. Only paste it into Make.com, never in your .env file.", S["warn"]))
    story.append(Spacer(1, 4))

    for s in step(3, "Buy a US phone number (+1) for demo", [
        'In VAPI dashboard → "Phone Numbers" → "Buy Number"',
        'Select Country: United States (+1)  ← use this for demo (cheaper, instant)',
        'US numbers cost ~$1-2/month and are available immediately',
        'India +91 numbers require extra verification — skip for demo',
        'Choose any US number and buy it',
        'Copy the Phone Number ID (looks like: abc123de-f456-...)',
        'Save this ID — you will paste it into Make.com Scenario 4 and 5',
    ], S): story.append(s)

    story.append(Paragraph(
        "Demo tip: For the hackathon demo, call YOUR OWN phone number to show judges "
        "a live AI call happening in real-time. The US VAPI number calls any phone worldwide.",
        S["tip"]))
    story.append(Spacer(1, 6*mm))

    # ════════════════════════════════════════════════════════════════════════
    # PART 2 — CREATE MAKE.COM ACCOUNT + FIRST WEBHOOK
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 2 — Make.com Account Setup", S["section"]))
    story.append(HRFlowable(width=W, thickness=1, color=ORANGE))
    story.append(Spacer(1, 4))

    for s in step(1, "Create Make.com account", [
        'Go to make.com and sign up',
        'Upgrade to Core plan ($10/month) — needed for webhooks + HTTP module',
    ], S): story.append(s)

    for s in step(2, "How to create a new Scenario (you will do this 5 times)", [
        'Click "+ Create a new scenario"',
        'Search for "Webhooks" → select "Custom webhook"',
        'Click "Add" to create the webhook trigger',
        'Click "Save" in the webhook panel to generate the URL',
        'Copy the URL — it looks like: https://hook.eu1.make.com/xxxxxxxxxxxx',
        'This URL goes into your .env.local file',
    ], S): story.append(s)

    story.append(Paragraph(
        "📌  Each scenario below starts the same way (steps above). "
        "After adding the Webhook trigger, add the next module shown for that scenario.",
        S["tip"]))
    story.append(Spacer(1, 6*mm))

    # ════════════════════════════════════════════════════════════════════════
    # SCENARIO 1 — SMS
    # ════════════════════════════════════════════════════════════════════════
    story += scenario_header(1, "Send SMS via MSG91 (Patient Alerts)", GREEN, S)

    story.append(Paragraph("Triggered when ASHA worker clicks <b>SMS Patient</b> button.", S["body"]))
    story.append(Spacer(1, 4))

    for s in step(1, "Add Webhook trigger", [
        'New scenario → search "Webhooks" → Custom webhook → Add → Save',
        'Copy the URL → this is VITE_MAKECOM_SMS_WEBHOOK',
    ], S): story.append(s)

    for s in step(2, "Add MSG91 module", [
        'Click + after webhook → search "MSG91"',
        'If MSG91 not found: use "HTTP" module → Make a request',
        'URL: https://api.msg91.com/api/v5/otp/send',
        'Method: POST',
    ], S): story.append(s)

    for s in step(3, "Configure MSG91 (using HTTP module)", [
        'Click + → HTTP → Make a request',
        'Method: POST',
        'URL: https://api.msg91.com/api/v5/flow/',
        'Headers: authkey = YOUR_MSG91_AUTH_KEY, content-type = application/json',
    ], S): story.append(s)

    story += code_block("HTTP Body (JSON) — map these from incoming webhook data:", [
        "{",
        '  "flow_id": "YOUR_MSG91_FLOW_ID",',
        '  "sender": "SHYDOC",',
        '  "mobiles": "91{{phone}}",',
        '  "message": "{{message}}"',
        "}",
    ], S)

    for s in step(4, "Map webhook fields to MSG91", [
        'In the HTTP body, click each field and select from webhook data:',
        'phone → {{1.phone}} (from webhook payload)',
        'message → {{1.message}} (from webhook payload)',
    ], S): story.append(s)

    for s in step(5, "Turn ON and save", [
        'Toggle the scenario ON (bottom-left switch)',
        'Click Save (disk icon)',
        'Paste the webhook URL into .env.local as VITE_MAKECOM_SMS_WEBHOOK',
    ], S): story.append(s)

    story.append(Paragraph("✅  Alternative: Use Twilio instead of MSG91. Search 'Twilio' in Make.com modules and follow the same pattern.", S["tip"]))
    story.append(Spacer(1, 5*mm))

    # ════════════════════════════════════════════════════════════════════════
    # SCENARIO 2 — EMAIL
    # ════════════════════════════════════════════════════════════════════════
    story += scenario_header(2, "Send Email via Gmail (Doctor Reports)", BLUE, S)

    story.append(Paragraph("Triggered when doctor clicks <b>Email Report</b> or system sends automated patient summary.", S["body"]))
    story.append(Spacer(1, 4))

    for s in step(1, "Add Webhook trigger", [
        'New scenario → Webhook → Custom webhook → copy URL',
        'URL → VITE_MAKECOM_EMAIL_WEBHOOK in .env.local',
    ], S): story.append(s)

    for s in step(2, "Add Gmail module", [
        'Click + → search "Gmail" → select "Send an Email"',
        'Click "Add" to connect your Google account',
        'Allow Make.com permissions',
    ], S): story.append(s)

    for s in step(3, "Configure Gmail fields", [
        'To: {{1.to}}   (from webhook)',
        'Subject: {{1.subject}}',
        'Content: HTML',
        'Body: {{1.html}}',
    ], S): story.append(s)

    for s in step(4, "Save and activate", [
        'Toggle ON → Save',
        'Paste URL into .env.local as VITE_MAKECOM_EMAIL_WEBHOOK',
    ], S): story.append(s)

    story.append(Spacer(1, 5*mm))

    # ════════════════════════════════════════════════════════════════════════
    # SCENARIO 3 — EMERGENCY ALERT
    # ════════════════════════════════════════════════════════════════════════
    story += scenario_header(3, "Emergency Alert — SMS + Email Combined", RED, S)

    story.append(Paragraph("Triggered when a HIGH RISK or EMERGENCY patient is flagged. Sends both SMS and email simultaneously.", S["body"]))
    story.append(Spacer(1, 4))

    for s in step(1, "Add Webhook trigger", [
        'New scenario → Webhook → Custom webhook → copy URL → VITE_MAKECOM_ALERT_WEBHOOK',
    ], S): story.append(s)

    for s in step(2, "Add Router module (splits into 2 parallel paths)", [
        'Click + → search "Router" (built-in Make.com module)',
        'This creates 2 branches: Path A (SMS) and Path B (Email)',
    ], S): story.append(s)

    for s in step(3, "Path A — SMS via HTTP (MSG91)", [
        'Add HTTP module in Path A (same as Scenario 1)',
        'Message template: "⚠ ALERT: {{1.name}} - {{1.risk_level}} - {{1.diagnosis}} at {{1.village}}"',
    ], S): story.append(s)

    for s in step(4, "Path B — Email via Gmail", [
        'Add Gmail module in Path B',
        'To: your_doctor@email.com (or {{1.doctorEmail}})',
        'Subject: "🚨 EMERGENCY: {{1.name}} needs immediate attention"',
        'Body: Include all fields from webhook: name, risk_level, diagnosis, village, phone',
    ], S): story.append(s)

    for s in step(5, "Save and activate", [
        'Toggle ON → Save',
        'Paste URL as VITE_MAKECOM_ALERT_WEBHOOK',
    ], S): story.append(s)

    story.append(Spacer(1, 5*mm))

    # ════════════════════════════════════════════════════════════════════════
    # SCENARIO 4 — VAPI AI CALL
    # ════════════════════════════════════════════════════════════════════════
    story += scenario_header(4, "VAPI AI Voice Call — Dial Patient Phone", PURPLE, S)

    story.append(Paragraph(
        "This is the KEY scenario. When ASHA clicks <b>AI Call</b>, Make.com calls the VAPI API "
        "which dials the patient's +91 number with an AI voice in Hindi/Kannada/English.",
        S["body"]))
    story.append(Spacer(1, 4))

    for s in step(1, "Add Webhook trigger", [
        'New scenario → Webhook → Custom webhook',
        'Click "Redetermine data structure" after setup so Make.com knows the fields',
        'Copy URL → VITE_MAKECOM_VAPI_WEBHOOK in .env.local',
    ], S): story.append(s)

    for s in step(2, "Add HTTP module (calls VAPI API)", [
        'Click + → HTTP → Make a request',
        'Method: POST',
        'URL: https://api.vapi.ai/call/phone',
        'Headers → Add item:',
        '  Name: Authorization',
        '  Value: Bearer YOUR_VAPI_PRIVATE_KEY  (paste your VAPI private key here)',
        'Content-Type: application/json',
    ], S): story.append(s)

    story += code_block("HTTP Request Body — paste this JSON and map {{variables}} from webhook:", [
        "{",
        '  "phoneNumberId": "PASTE_YOUR_VAPI_PHONE_NUMBER_ID_HERE",',
        '  "customer": {',
        '    "number": "{{1.patientPhone}}"   <- pass full number e.g. +919876543210 or +12125551234',
        '  },',
        '  "assistant": {',
        '    "firstMessage": "Namaste {{1.patientName}}, main Sahayak AI bol raha hoon.",',
        '    "transcriber": {',
        '      "provider": "deepgram",',
        '      "language": "{{1.language}}"',
        '    },',
        '    "model": {',
        '      "provider": "openai",',
        '      "model": "gpt-4o",',
        '      "systemPrompt": "You are Sahayak AI, a medical assistant. Patient: {{1.patientName}}. Context: {{1.context}}. Speak in Hindi/Kannada based on language setting. Help with health questions, medication reminders. For emergencies, advise immediate doctor visit."',
        '    },',
        '    "voice": {',
        '      "provider": "11labs",',
        '      "voiceId": "21m00Tcm4TlvDq8ikWAM"',
        '    },',
        '    "endCallFunctionEnabled": true,',
        '    "maxDurationSeconds": 300',
        '  }',
        "}",
    ], S)

    story.append(Paragraph(
        "💡  To map {{1.patientPhone}}: click inside the phoneNumberId field → "
        "select from the webhook data dropdown on the right panel.",
        S["tip"]))
    story.append(Spacer(1, 4))

    for s in step(3, "Test the scenario", [
        'Click "Run once" in Make.com',
        'In Sahayak AI frontend, click the "AI Call" button on any patient',
        'Make.com should show a green checkmark',
        'The patient phone number should ring within 10 seconds',
    ], S): story.append(s)

    for s in step(4, "Save and activate", [
        'Toggle ON → Save',
        'Restart the Sahayak frontend dev server to load new .env.local values',
        'Button will change from dashed "Add VAPI key" to solid green "AI Call"',
    ], S): story.append(s)

    story.append(Spacer(1, 5*mm))

    # ════════════════════════════════════════════════════════════════════════
    # SCENARIO 5 — DOCTOR BRIDGE
    # ════════════════════════════════════════════════════════════════════════
    story += scenario_header(5, "ASHA → Doctor Bridge Call (with AI Context Whisper)", colors.HexColor("#0891b2"), S)

    story.append(Paragraph(
        "Advanced scenario: ASHA initiates a call, VAPI AI briefly briefs the doctor about the patient "
        "('Dr. Sharma, connecting you to a patient with suspected dengue...'), then bridges both calls.",
        S["body"]))
    story.append(Spacer(1, 4))

    for s in step(1, "Add Webhook trigger", [
        'New scenario → Webhook → Custom webhook → copy URL → VITE_MAKECOM_VAPI_DOCTOR_WEBHOOK',
    ], S): story.append(s)

    for s in step(2, "Add HTTP module — call VAPI with doctor bridging config", [
        'Same as Scenario 4 but with different systemPrompt and recipient',
        'The phoneNumberId is the same VAPI India number',
        'customer.number = "+91{{1.doctorPhone}}"  (call doctor first)',
    ], S): story.append(s)

    story += code_block("System prompt for doctor bridge call:", [
        '"You are Sahayak AI. Briefly brief the doctor before connecting.',
        " Say: 'Dr. {{1.doctorName}}, you have a patient {{1.patientName}},",
        " {{1.patientAge}} years, from {{1.village}}, diagnosed with {{1.diagnosis}}.",
        " Risk level: {{1.riskLevel}}. Connecting now.'",
        " Then say you are transferring and end the AI portion.\"",
    ], S)

    for s in step(3, "Save and activate", [
        'Toggle ON → Save',
        'Paste URL as VITE_MAKECOM_VAPI_DOCTOR_WEBHOOK',
    ], S): story.append(s)

    story.append(Spacer(1, 5*mm))

    # ════════════════════════════════════════════════════════════════════════
    # PART 3 — ENV VARIABLES SUMMARY
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 3 — Final .env.local File", S["section"]))
    story.append(HRFlowable(width=W, thickness=1, color=ORANGE))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "After completing all 5 scenarios, your .env.local file should look like this "
        "(located at: sahayak-frontend/.env.local):",
        S["body"]))
    story.append(Spacer(1, 4))

    story += code_block("sahayak-frontend/.env.local", [
        "# Backend",
        "VITE_API_URL=http://localhost:8000",
        "",
        "# Firebase (from Firebase Console)",
        "VITE_FIREBASE_API_KEY=AIzaSy...",
        "VITE_FIREBASE_AUTH_DOMAIN=your-app.firebaseapp.com",
        "VITE_FIREBASE_PROJECT_ID=your-project-id",
        "VITE_FIREBASE_STORAGE_BUCKET=your-app.appspot.com",
        "VITE_FIREBASE_MESSAGING_SENDER_ID=123456789",
        "VITE_FIREBASE_APP_ID=1:123456789:web:abc...",
        "",
        "# Make.com Webhooks (from make.com → each scenario)",
        "VITE_MAKECOM_SMS_WEBHOOK=https://hook.eu1.make.com/xxxxxxxx",
        "VITE_MAKECOM_EMAIL_WEBHOOK=https://hook.eu1.make.com/yyyyyyyy",
        "VITE_MAKECOM_ALERT_WEBHOOK=https://hook.eu1.make.com/zzzzzzzz",
        "VITE_MAKECOM_VAPI_WEBHOOK=https://hook.eu1.make.com/aaaaaaaa",
        "VITE_MAKECOM_VAPI_DOCTOR_WEBHOOK=https://hook.eu1.make.com/bbbbbbbb",
    ], S)

    story.append(Paragraph("⚠  Never commit .env.local to Git. It's in .gitignore by default.", S["warn"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "After editing .env.local, restart the dev server for changes to take effect:",
        S["body"]))
    story += code_block("Terminal command:", [
        "# In sahayak-frontend folder:",
        "npm run dev",
    ], S)

    story.append(Spacer(1, 5*mm))

    # ════════════════════════════════════════════════════════════════════════
    # PART 4 — TESTING CHECKLIST
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 4 — Testing Checklist", S["section"]))
    story.append(HRFlowable(width=W, thickness=1, color=ORANGE))
    story.append(Spacer(1, 4))

    checks = [
        ["✅", "Scenario 1", "ASHA dashboard → high-risk patient → SMS button → phone receives message within 30s"],
        ["✅", "Scenario 2", "Doctor dashboard → patient → Send Alert → check your email inbox"],
        ["✅", "Scenario 3", "Doctor dashboard → EMERGENCY patient → Send Alert button → both SMS and email arrive"],
        ["✅", "Scenario 4", "AI Call button → Make.com triggers VAPI → your phone rings (use your own number for demo)"],
        ["✅", "Scenario 5", "Doctor PatientDetail → Call Doctor button → doctor phone rings with AI briefing first"],
        ["✅", "PDF Download", "PatientDetail → Download PDF button → PDF saves to device"],
        ["✅", "View Report", "PatientDetail → View button → modal opens with vitals and Download PDF inside"],
    ]
    tbl = Table(checks, colWidths=[8*mm, 35*mm, W - 43*mm])
    tbl.setStyle(TableStyle([
        ("FONTNAME",      (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, LIGHT_BG]),
        ("GRID",          (0,0), (-1,-1), 0.5, colors.HexColor("#e5e7eb")),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("FONTNAME",      (1,0), (1,-1), "Helvetica-Bold"),
        ("TEXTCOLOR",     (1,0), (1,-1), ORANGE),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 6*mm))

    # ════════════════════════════════════════════════════════════════════════
    # PART 5 — TROUBLESHOOTING
    # ════════════════════════════════════════════════════════════════════════
    story.append(Paragraph("Part 5 — Troubleshooting", S["section"]))
    story.append(HRFlowable(width=W, thickness=1, color=ORANGE))
    story.append(Spacer(1, 4))

    issues = [
        ("Button still shows 'Add VAPI key' after adding .env",
         "Restart the dev server (npm run dev). Vite only reads .env on startup."),
        ("Make.com shows error 422 from VAPI",
         "Check that phoneNumberId is correct. Go to VAPI dashboard → Phone Numbers → copy the ID (not the number itself)."),
        ("SMS not received in India",
         "MSG91 needs DLT registration for promotional SMS. Use Twilio as alternative — no DLT needed for test mode."),
        ("Make.com scenario not triggering",
         "Check the scenario is toggled ON. Also verify the webhook URL in .env matches exactly what Make.com shows."),
        ("VAPI call connects but no audio / wrong language",
         "Check the language field in the webhook payload. Send 'hi-IN' for Hindi, 'kn-IN' for Kannada, 'en-US' for English."),
        ("Make.com 'Run once' mode vs Active mode",
         "'Run once' = manual test (click manually). Toggle ON = runs automatically on every webhook trigger."),
    ]

    for prob, sol in issues:
        prob_para = Paragraph(f"<b>Problem:</b> {prob}", S["body"])
        sol_para  = Paragraph(f"<b>Solution:</b> {sol}", S["tip"])
        story.append(KeepTogether([prob_para, sol_para, Spacer(1, 4)]))

    story.append(Spacer(1, 6*mm))

    # ════════════════════════════════════════════════════════════════════════
    # FOOTER SUMMARY
    # ════════════════════════════════════════════════════════════════════════
    footer_data = [[
        Paragraph(
            "<b>Sahayak AI</b> · Team DreamAlpha · AMD Slingshot Hackathon 2025<br/>"
            "AI-powered offline-first healthcare for rural India · Built with AMD Ryzen AI NPU",
            S["footer"]
        )
    ]]
    footer_tbl = Table(footer_data, colWidths=[W])
    footer_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), DARK_BG),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
    ]))
    story.append(footer_tbl)

    # Build
    doc.build(story)
    print(f"\nPDF created: {OUTPUT}\n")

if __name__ == "__main__":
    build()
