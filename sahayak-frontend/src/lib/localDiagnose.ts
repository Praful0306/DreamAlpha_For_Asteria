/**
 * localDiagnose — offline / demo-mode diagnosis engine
 *
 * Rule-based keyword matching for common Indian rural health conditions.
 * Used when:
 *   1. User is in demo mode (no backend token)
 *   2. Backend is unreachable (Render sleeping / no internet)
 *
 * Returns a realistic DiagnosisResult so the UI stays fully functional offline.
 */

import type { DiagnosisResult } from "@/lib/api"

interface Condition {
  keywords:   RegExp[]
  result:     DiagnosisResult
}

const CONDITIONS: Condition[] = [
  // ── Malaria ────────────────────────────────────────────────────────────────
  {
    keywords: [
      /\bmalaria\b/i,
      /\brigou?r\b/i,
      /chills?.{0,25}fever|fever.{0,25}chill/i,
      /\bplasmodium\b/i,
    ],
    result: {
      risk_level: "HIGH",
      disease_name: "Suspected Malaria",
      diagnosis: "Malaria (Plasmodium — species TBC)",
      confidence_pct: 76,
      clinical_summary:
        "Presentation consistent with malaria: cyclical fever with chills or rigors. " +
        "Immediate malaria RDT at PHC is mandatory. If positive, start artemisinin-based combination therapy (ACT). " +
        "Monitor hydration and temperature every 4 hours.",
      recommendations: [
        "Refer to PHC for malaria RDT immediately",
        "Artemether-lumefantrine if RDT positive (prescribe at PHC)",
        "Paracetamol 500 mg TDS for fever control",
        "Oral rehydration salts (ORS) to prevent dehydration",
        "Ensure patient rests under a mosquito net",
        "Re-assess in 48 hours or sooner if worsening",
      ],
      medications_suggested: [
        "Paracetamol 500 mg TDS (for fever)",
        "ORS sachets",
        "Artemether-Lumefantrine (only after RDT confirmation at PHC)",
      ],
      warning_signs: [
        "Altered consciousness or confusion",
        "Repeated convulsions or seizures",
        "Severe vomiting preventing oral medication",
        "Jaundice or dark urine",
        "Haemoglobin < 7 g/dL",
        "Respiratory distress",
      ],
      action_items: [
        "Perform malaria RDT at PHC",
        "Notify block health officer if cluster of cases",
      ],
      followup_days: 2,
      sources: [
        "NVBDCP Malaria Treatment Guidelines 2023",
        "WHO Malaria Treatment Guidelines 3rd Ed.",
      ],
      community_alert:
        "Check for stagnant water near the patient's home. A malaria cluster is possible if multiple cases present in the same village.",
    },
  },

  // ── Dengue ─────────────────────────────────────────────────────────────────
  {
    keywords: [
      /\bdengue\b/i,
      /platelet/i,
      /thrombocytopenia/i,
      /retro.{0,10}orbital/i,
      /break.?bone|bonepain.{0,15}fever|fever.{0,15}bonepain/i,
    ],
    result: {
      risk_level: "HIGH",
      disease_name: "Suspected Dengue Fever",
      diagnosis: "Dengue Fever (NS1 / serology TBC)",
      confidence_pct: 74,
      clinical_summary:
        "Sudden-onset high fever with severe headache, retro-orbital pain, myalgia, and rash is classic dengue. " +
        "NS1 antigen or dengue serology should be done urgently. Platelet count monitoring is critical — " +
        "counts < 1 lakh/µL indicate severe dengue requiring hospital admission.",
      recommendations: [
        "NS1 antigen test or dengue serology at PHC/CHC",
        "Daily platelet count monitoring",
        "Paracetamol only for fever — AVOID aspirin/ibuprofen (risk of bleeding)",
        "Oral rehydration: 2–3 litres of fluid per day",
        "Refer to hospital if platelets < 1 lakh/µL or bleeding signs appear",
        "Rest and mosquito-net use",
      ],
      medications_suggested: [
        "Paracetamol 500 mg TDS (do NOT use aspirin or NSAIDs)",
        "ORS and coconut water for hydration",
      ],
      warning_signs: [
        "Platelet count below 50,000/µL",
        "Any bleeding (gums, nose, skin petechiae)",
        "Severe abdominal pain",
        "Persistent vomiting",
        "Restlessness or altered mental status",
      ],
      action_items: [
        "Arrange NS1 antigen test",
        "Monitor platelet count daily",
        "Educate family on dengue warning signs",
      ],
      followup_days: 1,
      sources: [
        "NVBDCP Dengue Clinical Management Guidelines 2021",
        "WHO Dengue Guidelines 2009 (updated 2012)",
      ],
      community_alert:
        "Dengue is vector-borne (Aedes mosquito). Survey for water containers, tyres, and flowerpots with stagnant water in the vicinity. Fogging may be needed.",
    },
  },

  // ── Typhoid ────────────────────────────────────────────────────────────────
  {
    keywords: [
      /\btyphoid\b/i,
      /enteric.?fever/i,
      /salmonella/i,
      /widal/i,
    ],
    result: {
      risk_level: "MEDIUM",
      disease_name: "Suspected Typhoid (Enteric Fever)",
      diagnosis: "Typhoid Fever",
      confidence_pct: 68,
      clinical_summary:
        "Prolonged step-ladder fever with headache, abdominal pain, and coated tongue suggests enteric fever. " +
        "Widal test or blood culture (preferred) needed for confirmation. " +
        "Treatment is antibiotics; azithromycin or cefixime for uncomplicated cases.",
      recommendations: [
        "Widal test or blood culture for confirmation",
        "Azithromycin 500 mg daily × 7 days (first line)",
        "Plenty of fluids and light diet",
        "Strict hand hygiene and food/water sanitation",
        "Refer to doctor if no improvement in 3 days",
      ],
      medications_suggested: [
        "Azithromycin 500 mg OD × 7 days",
        "Paracetamol 500 mg for fever",
        "ORS for hydration",
      ],
      warning_signs: [
        "Intestinal perforation (sudden worsening abdominal pain, rigid abdomen)",
        "Encephalopathy (confusion, altered consciousness)",
        "GI bleeding (dark/tarry stools)",
      ],
      action_items: [
        "Confirm with Widal test",
        "Advise safe drinking water and hand hygiene",
      ],
      followup_days: 3,
      sources: ["ICMR Typhoid Treatment Guidelines", "WHO Typhoid Fever Guide"],
      community_alert:
        "Typhoid is waterborne. Check community water source sanitation if multiple cases.",
    },
  },

  // ── TB / Tuberculosis ──────────────────────────────────────────────────────
  {
    keywords: [
      /\bt\.?b\.?\b|\btuberculosis\b/i,
      /chronic.{0,20}cough|cough.{0,10}3.?week|cough.{0,10}month/i,
      /sputum|haemoptysis|blood.{0,10}cough|cough.{0,10}blood/i,
      /night.?sweat.{0,20}weight.?loss|weight.?loss.{0,20}night.?sweat/i,
    ],
    result: {
      risk_level: "HIGH",
      disease_name: "Suspected Pulmonary Tuberculosis",
      diagnosis: "Tuberculosis — refer for CBNAAT/sputum test",
      confidence_pct: 70,
      clinical_summary:
        "Cough > 2 weeks with night sweats, weight loss, and/or blood in sputum is a TB presumptive case under NTEP. " +
        "Immediate referral for CBNAAT sputum test is mandatory. Do not start empirical ATT without confirmation.",
      recommendations: [
        "Refer to NTEP designated microscopy centre (DMC) for sputum CBNAAT",
        "Register patient as TB presumptive case under NTEP",
        "Do not start ATT without microbiological confirmation",
        "Isolate patient (cover mouth when coughing, separate utensils)",
        "Nutritional support: Nikshay Poshan Yojana enrollment",
        "Screen household contacts",
      ],
      medications_suggested: [
        "ATT (HRZE/HR regimen) — only after confirmation at NTEP DMC",
        "High-protein diet supplementation",
      ],
      warning_signs: [
        "Frank haemoptysis (significant blood in sputum)",
        "Respiratory failure / SpO2 < 90%",
        "Severe weight loss / cachexia",
        "TB meningitis symptoms (neck stiffness, photophobia)",
      ],
      action_items: [
        "Refer to DMC for CBNAAT sputum test today",
        "Enroll in NTEP and Nikshay portal",
        "Screen all household contacts within 7 days",
      ],
      followup_days: 3,
      sources: ["NTEP National TB Elimination Programme Guidelines", "WHO TB Guidelines 2022"],
      community_alert:
        "TB is airborne. Screen household contacts and close associates. Notify block TB officer.",
    },
  },

  // ── Anaemia ────────────────────────────────────────────────────────────────
  {
    keywords: [
      /anaemi[ac]|anemi[ac]/i,
      /\bh(?:ae)?moglobin\b|\bhb\b.{0,10}[0-9]/i,
      /pallor|pale.{0,10}conjunctiv/i,
      /iron.?deficien/i,
    ],
    result: {
      risk_level: "MEDIUM",
      disease_name: "Anaemia (Iron Deficiency Suspected)",
      diagnosis: "Anaemia — IDA probable",
      confidence_pct: 72,
      clinical_summary:
        "Pallor of conjunctiva and low haemoglobin suggest iron deficiency anaemia — " +
        "the most common nutritional deficiency in rural India. IFA tablet supplementation and dietary counselling are first line. " +
        "If Hb < 7 g/dL, refer for further evaluation and possible IV iron/transfusion.",
      recommendations: [
        "Distribute IFA tablets (iron 100 mg + folic acid 0.5 mg) daily for 3–6 months",
        "Dietary counselling: dark leafy greens, lentils, jaggery, citrus (vitamin C) for iron absorption",
        "Check Hb after 1 month of supplementation",
        "Deworm with Albendazole 400 mg single dose if not done in last 6 months",
        "Refer to PHC if Hb < 7 g/dL",
      ],
      medications_suggested: [
        "IFA tablets 100 mg + 0.5 mg folic acid OD",
        "Albendazole 400 mg single dose (deworming)",
      ],
      warning_signs: [
        "Haemoglobin < 7 g/dL (severe anaemia — refer)",
        "Shortness of breath at rest",
        "Chest pain or palpitations",
        "Oedema (swelling) of feet",
      ],
      action_items: [
        "Distribute IFA tablets from ASHA drug kit",
        "Schedule Hb recheck in 4 weeks",
        "Refer if severe (Hb < 7)",
      ],
      followup_days: 30,
      sources: ["ICMR Anaemia Mukt Bharat Guidelines", "NIN Dietary Reference Values"],
      community_alert: null,
    },
  },

  // ── Hypertension / BP ──────────────────────────────────────────────────────
  {
    keywords: [
      /hypertension|high.?blood.?pressure|h\.?b\.?p/i,
      /bp\s*[0-9]{2,3}\s*\/\s*[89][0-9]|bp\s*1[4-9][0-9]|bp\s*[2-9][0-9]{2}/i,
      /systolic.{0,10}1[4-9][0-9]|systolic.{0,10}[2-9][0-9]{2}/i,
    ],
    result: {
      risk_level: "MEDIUM",
      disease_name: "Hypertension",
      diagnosis: "Arterial Hypertension",
      confidence_pct: 75,
      clinical_summary:
        "Elevated blood pressure (≥ 140/90 mmHg) without adequate treatment is a major risk factor for stroke, " +
        "heart attack, and kidney disease. Lifestyle modification is first line; antihypertensive medication may be needed. " +
        "Regular BP monitoring at home or PHC is essential.",
      recommendations: [
        "Reduce salt intake to < 5 g/day; avoid pickles, papad, processed foods",
        "Daily 30-minute brisk walk or moderate exercise",
        "If BP ≥ 160/100 or not controlled with lifestyle, refer to PHC doctor for medication",
        "Monitor BP weekly until stable, then monthly",
        "Avoid smoking and alcohol",
        "Ensure adequate sleep (7–8 hours)",
      ],
      medications_suggested: [
        "Amlodipine 5 mg OD (if prescribed by PHC doctor)",
        "Paracetamol for headache (avoid NSAIDs — raise BP)",
      ],
      warning_signs: [
        "BP ≥ 180/120 (hypertensive emergency — refer immediately)",
        "Severe headache with vomiting and vision changes",
        "Chest pain or palpitations",
        "Slurred speech or facial drooping (stroke signs)",
        "Breathlessness at rest",
      ],
      action_items: [
        "Refer to PHC for formal diagnosis and treatment initiation",
        "Educate patient on DASH diet and salt restriction",
        "Enroll in NCD clinic if available at PHC",
      ],
      followup_days: 7,
      sources: ["ICMR Hypertension Guidelines 2023", "BHS/ISH Hypertension Guideline 2020"],
      community_alert: null,
    },
  },

  // ── Diabetes ───────────────────────────────────────────────────────────────
  {
    keywords: [
      /diabet/i,
      /blood.?sugar|fasting.?sugar|random.?sugar/i,
      /hyperglycemi/i,
      /sugar.{0,10}[2-9][0-9]{2}|sugar.{0,10}1[5-9][0-9]/i,
    ],
    result: {
      risk_level: "MEDIUM",
      disease_name: "Diabetes Mellitus (Type 2 Suspected)",
      diagnosis: "Diabetes Mellitus — confirm with FBS/PPBS",
      confidence_pct: 70,
      clinical_summary:
        "Elevated blood sugar with symptoms of polyuria, polydipsia, and fatigue suggests type 2 diabetes. " +
        "Fasting blood sugar ≥ 126 mg/dL or PPBS ≥ 200 mg/dL on two occasions confirms diagnosis. " +
        "Lifestyle modification and metformin are first-line treatments.",
      recommendations: [
        "Refer to PHC for FBS and PPBS test to confirm diagnosis",
        "Low-sugar, low-refined-carb diet: avoid white rice, maida, sweets",
        "Daily 30–45 minute brisk walk",
        "Monitor blood sugar monthly",
        "Foot care: inspect feet daily for sores (diabetic neuropathy risk)",
        "Eye check annually for retinopathy",
      ],
      medications_suggested: [
        "Metformin 500 mg OD with meals (if prescribed by PHC doctor)",
        "Glipizide 5 mg (if metformin insufficient — PHC prescription needed)",
      ],
      warning_signs: [
        "Blood sugar > 400 mg/dL (diabetic ketoacidosis risk — refer immediately)",
        "Hypoglycaemia (blood sugar < 70): sweating, confusion, weakness",
        "Non-healing foot ulcers or infections",
        "Sudden vision change",
        "Chest pain (CVD risk high in diabetics)",
      ],
      action_items: [
        "Refer to PHC NCD clinic for FBS/PPBS confirmation",
        "Educate on dietary changes and daily exercise",
        "Enroll in NPCDCS programme at PHC",
      ],
      followup_days: 14,
      sources: ["ICMR Clinical Practice Guidelines for Type 2 Diabetes 2023", "ADA Standards of Care 2024"],
      community_alert: null,
    },
  },

  // ── Diarrhoea / Dehydration ────────────────────────────────────────────────
  {
    keywords: [
      /diarrhoea|diarrhea|loose.?stool|watery.?stool/i,
      /cholera|gastroenter/i,
      /dehydrat/i,
    ],
    result: {
      risk_level: "MEDIUM",
      disease_name: "Acute Diarrhoea / Gastroenteritis",
      diagnosis: "Acute Gastroenteritis",
      confidence_pct: 78,
      clinical_summary:
        "Acute diarrhoea with or without vomiting is most commonly viral or bacterial in origin. " +
        "The primary danger is dehydration, especially in children and the elderly. " +
        "ORS is the cornerstone of treatment. Antibiotics are not routinely needed unless bloody stools or systemic illness.",
      recommendations: [
        "Start ORS immediately — 200–400 mL after each loose stool",
        "Continue breastfeeding in infants; no dietary restriction otherwise",
        "Zinc 20 mg/day for 14 days in children under 5",
        "Refer to PHC if signs of severe dehydration (sunken eyes, no urine > 6 hours, very dry mouth)",
        "Hand washing with soap after toilet use to prevent spread",
      ],
      medications_suggested: [
        "ORS (Oral Rehydration Salts) — home-prepared or WHO-formula",
        "Zinc sulfate 20 mg OD × 14 days (children < 5)",
      ],
      warning_signs: [
        "Sunken eyes, very dry mouth, skin turgor loss (severe dehydration)",
        "No urine output for > 6 hours (adults) or > 8 hours (children)",
        "Blood in stools (dysentery — needs antibiotics)",
        "High fever > 102°F with diarrhoea",
        "Altered consciousness or convulsions",
      ],
      action_items: [
        "Distribute ORS packets from ASHA drug kit",
        "Advise safe water (boiled or chlorinated) and hand hygiene",
        "Refer to PHC if not improving in 24 hours",
      ],
      followup_days: 1,
      sources: ["IMNCI Diarrhoea Management Protocol", "WHO Diarrhoea Treatment Guidelines 2005"],
      community_alert:
        "Waterborne gastroenteritis can cluster. Check community water source. Report to block health officer if > 3 cases in same locality.",
    },
  },

  // ── Respiratory / Chest ────────────────────────────────────────────────────
  {
    keywords: [
      /chest.?pain|angina/i,
      /myocardial|heart.?attack/i,
      /\basthma\b/i,
      /breath(?:ing)?.{0,15}difficult|shortness.?of.?breath|dyspnoea/i,
      /wheez/i,
    ],
    result: {
      risk_level: "HIGH",
      disease_name: "Respiratory / Cardiac Emergency",
      diagnosis: "Respiratory distress — cardiac or pulmonary cause possible",
      confidence_pct: 65,
      clinical_summary:
        "Chest pain or severe breathing difficulty may indicate a cardiac event (heart attack) or acute respiratory illness (severe asthma, pneumonia). " +
        "This is a potential emergency. Immediate referral to PHC or District Hospital is recommended. " +
        "Do not delay — call 108 if patient is in severe distress.",
      recommendations: [
        "Call 108 or arrange immediate transport to PHC/District Hospital",
        "If asthma: use salbutamol inhaler (2 puffs) if available",
        "Sit patient upright; do not lay flat if breathing difficulty",
        "If suspected heart attack: aspirin 325 mg (chew, not swallow) if not contraindicated",
        "Monitor SpO2; administer oxygen if available",
      ],
      medications_suggested: [
        "Salbutamol MDI 100 µg — 2 puffs for acute bronchospasm (asthma)",
        "Aspirin 325 mg (chew) — suspected cardiac event only",
        "Call 108 — this is an emergency",
      ],
      warning_signs: [
        "SpO2 < 90% (hypoxia — immediate referral)",
        "Cyanosis (blue lips or fingertips)",
        "Loss of consciousness",
        "Worsening chest pain radiating to arm or jaw",
        "Inability to speak in full sentences due to breathlessness",
      ],
      action_items: [
        "Call 108 immediately if severe distress",
        "Refer to PHC/District Hospital without delay",
        "Do ECG at PHC to rule out MI",
      ],
      followup_days: 0,
      sources: ["BLS/ACLS Protocols India", "GINA Asthma Guidelines 2024"],
      community_alert: null,
    },
  },

  // ── ANC / Pregnancy ────────────────────────────────────────────────────────
  {
    keywords: [
      /pregnan/i,
      /\banc\b|antenatal|prenatal/i,
      /trimester/i,
      /obstetric/i,
    ],
    result: {
      risk_level: "MEDIUM",
      disease_name: "Antenatal Care (ANC)",
      diagnosis: "Pregnancy — ANC visit assessment",
      confidence_pct: 80,
      clinical_summary:
        "This patient is pregnant and requires regular ANC check-ups per the JSSK/PMSMA programme. " +
        "Ensure IFA tablet intake, TT immunisation, and blood pressure/fundal height monitoring at every visit. " +
        "High-risk indicators: Hb < 9, BP ≥ 140/90, oedema, reduced foetal movements.",
      recommendations: [
        "Ensure at least 4 ANC visits (8w, 14w, 28w, 36w)",
        "IFA (180 mg) tablet: one tablet daily for 180 days — monitor compliance",
        "TT immunisation: 2 doses (TT1 and TT2) as per schedule",
        "Calcium supplementation: 1 g/day from 14 weeks",
        "Blood pressure and haemoglobin check at every ANC visit",
        "Institutional delivery counselling — JSY incentive available",
        "Refer to PHC/CHC if Hb < 9 g/dL, BP ≥ 140/90, or reduced foetal movements",
      ],
      medications_suggested: [
        "IFA (Iron 60 mg + Folic Acid 0.5 mg) 3 tabs daily",
        "Calcium 1 g OD from 14 weeks",
        "Pyridoxine 10 mg for nausea (first trimester)",
      ],
      warning_signs: [
        "Haemoglobin < 9 g/dL (refer immediately)",
        "BP ≥ 140/90 (pre-eclampsia risk — refer)",
        "Severe oedema (face, hands, feet)",
        "Reduced or absent foetal movements",
        "Vaginal bleeding at any stage",
        "Eclampsia signs: headache, visual disturbances, epigastric pain",
      ],
      action_items: [
        "Ensure ANC registration at PHC/sub-centre",
        "Issue MCH card and track on RCH portal",
        "Schedule next ANC visit",
        "Enroll for JSY / Janani Suraksha Yojana",
      ],
      followup_days: 28,
      sources: ["MoHFW Operational Guidelines for ANC", "RCOG/WHO ANC Guidelines"],
      community_alert: null,
    },
  },

  // ── General Fever (catch-all) ──────────────────────────────────────────────
  {
    keywords: [
      /\bfever\b|\bbukhar\b|\btar\b.{0,5}temp/i,
      /temperature.{0,10}[1-9][0-9]|temp.{0,10}[1-9][0-9]/i,
    ],
    result: {
      risk_level: "MEDIUM",
      disease_name: "Acute Febrile Illness",
      diagnosis: "Fever — aetiology to be determined",
      confidence_pct: 60,
      clinical_summary:
        "Acute fever without localising signs requires assessment for malaria, dengue, typhoid, and respiratory infections — " +
        "the four most common causes in rural India. Perform a complete clinical examination and targeted tests based on local disease prevalence.",
      recommendations: [
        "Malaria RDT if fever > 2 days or chills/rigors present",
        "Dengue NS1 antigen if platelet count is low or severe myalgia",
        "Paracetamol 500 mg TDS for fever relief (not aspirin)",
        "Oral fluids/ORS to prevent dehydration",
        "Refer to PHC if fever > 3 days without improvement",
      ],
      medications_suggested: [
        "Paracetamol 500 mg TDS (do NOT give aspirin or ibuprofen empirically)",
        "ORS for hydration",
      ],
      warning_signs: [
        "Altered consciousness or confusion",
        "Convulsions",
        "Neck stiffness with fever (meningitis)",
        "Severe difficulty breathing",
        "Bleeding from any site",
      ],
      action_items: [
        "Check for malaria (RDT), dengue (NS1), and CBC at PHC",
        "Re-evaluate in 48 hours if fever persists",
      ],
      followup_days: 2,
      sources: ["ICMR Clinical Guidelines for Fever", "NVBDCP Fever Guidelines"],
      community_alert: null,
    },
  },
]

// ── Default fallback ───────────────────────────────────────────────────────────

const DEFAULT_RESULT: DiagnosisResult = {
  risk_level: "LOW",
  disease_name: "General Health Assessment",
  diagnosis: "No specific diagnosis — monitor and refer if worsening",
  confidence_pct: 45,
  clinical_summary:
    "Based on the symptoms described, no high-risk condition has been identified at this time. " +
    "Continue to monitor the patient's condition and refer to PHC if symptoms worsen, persist beyond 3 days, " +
    "or new symptoms develop. Ensure good hydration, rest, and a balanced diet.",
  recommendations: [
    "Encourage oral fluids and rest",
    "Paracetamol 500 mg TDS if pain or fever present",
    "Return to ASHA or visit PHC if not improving in 3 days",
    "Maintain regular vital sign monitoring",
  ],
  medications_suggested: [
    "Paracetamol 500 mg TDS as needed",
    "ORS if dehydrated",
  ],
  warning_signs: [
    "High fever (> 103°F / 39.5°C)",
    "Difficulty breathing or chest pain",
    "Altered consciousness",
    "Vomiting persisting > 24 hours",
  ],
  action_items: ["Monitor and re-assess in 48 hours"],
  followup_days: 3,
  sources: ["ICMR Clinical Practice Guidelines"],
  community_alert: null,
}

/**
 * Classify symptoms + vitals locally using rule-based keyword matching.
 *
 * Priority: first match wins (ordered from highest-risk conditions first).
 * Falls back to DEFAULT_RESULT if no keywords match.
 */
export function localDiagnose(symptoms: string, vitals = ""): DiagnosisResult {
  const text = `${symptoms} ${vitals}`.toLowerCase()

  for (const condition of CONDITIONS) {
    if (condition.keywords.some(re => re.test(text))) {
      return condition.result
    }
  }

  return DEFAULT_RESULT
}
