import random
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import sys
import os

# Add sahayak to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db.database import (
    SessionLocal, User, Patient, MedicalReport, Checkup, 
    DoctorPatientAccess, DiagnosisLog, Appointment, AshaCallLog
)

def get_random_date(start_days_ago, end_days_ago):
    return datetime.utcnow() - timedelta(days=random.randint(end_days_ago, start_days_ago))

def populate_data():
    db = SessionLocal()
    
    # Get standard users
    asha = db.query(User).filter(User.email == 'asha@sahayak.ai').first()
    doctor = db.query(User).filter(User.email == 'doctor@sahayak.ai').first()
    
    if not asha or not doctor:
        print("Standard demo users (asha@sahayak.ai, doctor@sahayak.ai) not found!")
        # Fallback to any asha/doctor
        asha = db.query(User).filter(User.role == 'asha').first()
        doctor = db.query(User).filter(User.role == 'doctor').first()
        
    if not asha or not doctor:
        print("No ASHA or Doctor found in the system. Please register them first.")
        return
        
    print(f"Using ASHA: {asha.email} and Doctor: {doctor.email}")

    # Common Indian names for demo data
    first_names = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Ayaan", "Krishna", "Ishaan", "Shaurya", "Saanvi", "Aanya", "Aadhya", "Aaradhya", "Ananya", "Pari", "Diya", "Nandini", "Kavya", "Navya"]
    last_names = ["Sharma", "Patel", "Kumar", "Singh", "Das", "Kaur", "Gupta", "Mehta", "Trivedi", "Joshi", "Verma", "Chauhan", "Yadav", "Rajput"]
    villages = ["Rampur", "Shantipur", "Kamalpur", "Nandigram", "Gokul", "Vrindavan"]
    
    diseases = ["Type 2 Diabetes", "Hypertension", "Anemia", "Tuberculosis", "Asthma", "Malaria", "Dengue", "Typhoid", "Cholera", "Malnutrition"]
    
    # Create 15 patients
    new_patients = []
    for i in range(15):
        name = f"{random.choice(first_names)} {random.choice(last_names)}"
        patient = Patient(
            name=name,
            age=random.randint(18, 75),
            gender=random.choice(["male", "female"]),
            phone=f"98{random.randint(10000000, 99999999)}",
            village=random.choice(villages),
            district="Bhopal",
            medical_history=random.choice(["None", "Family history of diabetes", "Asthma since childhood", "Hypertension"]),
            weight_kg=round(random.uniform(45.0, 90.0), 1),
            blood_group=random.choice(["A+", "B+", "O+", "AB+", "O-"]),
            asha_worker_id=asha.id,
            asha_firebase_uid=asha.firebase_uid,
            share_code=f"SH_{random.randint(1000, 9999)}_{i}",
            created_at=get_random_date(60, 5)
        )
        db.add(patient)
        new_patients.append(patient)
        
    db.commit()
    print(f"Added {len(new_patients)} patients.")

    # Add records for each patient
    for patient in new_patients:
        # Give doctor access to 60% of patients
        if random.random() < 0.6:
            access = DoctorPatientAccess(
                doctor_id=doctor.id,
                patient_id=patient.id,
                granted_at=get_random_date(30, 1)
            )
            db.add(access)

        # 1-3 Medical Reports
        for _ in range(random.randint(1, 3)):
            risk = random.choice(["LOW", "MEDIUM", "HIGH"])
            report = MedicalReport(
                patient_id=patient.id,
                report_title=f"Routine Health Check - {get_random_date(30, 0).strftime('%b %Y')}",
                report_type=random.choice(["vitals", "blood_test"]),
                bp=f"{random.randint(110, 150)}/{random.randint(70, 100)}",
                hr=random.randint(60, 100),
                temp=str(round(random.uniform(97.5, 100.5), 1)),
                spo2=random.randint(92, 100),
                weight_kg=patient.weight_kg,
                sugar_fasting=round(random.uniform(80.0, 140.0), 1),
                symptoms=random.choice(["Fever, cough", "Fatigue, weakness", "Headache", "None"]),
                diagnosis=random.choice(diseases),
                risk_level=risk,
                ai_risk_level=risk,
                ai_summary="AI Analysis: Patient requires monitoring." if risk == "HIGH" else "Patient is stable.",
                ai_confidence=random.randint(85, 99),
                created_at=get_random_date(45, 1)
            )
            db.add(report)

        # 1-2 Checkups
        for _ in range(random.randint(1, 2)):
            checkup = Checkup(
                patient_id=patient.id,
                checkup_date=get_random_date(60, 10),
                next_checkup=get_random_date(0, -30), # future date
                doctor_name=doctor.full_name,
                hospital="District Hospital",
                reason="Routine follow-up",
                findings="Patient condition is stable.",
                created_at=get_random_date(60, 10)
            )
            db.add(checkup)

        # 1-3 Diagnosis Logs
        for _ in range(random.randint(1, 3)):
            diag = DiagnosisLog(
                patient_id=patient.id,
                district=patient.district,
                disease_name=random.choice(diseases),
                risk_level=random.choice(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
                confidence_pct=random.randint(70, 99),
                user_id=asha.id,
                asha_worker_id=asha.id,
                created_at=get_random_date(30, 1)
            )
            db.add(diag)
            
        # 1-2 Asha Call Logs
        for _ in range(random.randint(1, 2)):
            call = AshaCallLog(
                direction=random.choice(["inbound", "outbound"]),
                call_type="followup",
                patient_id=patient.id,
                patient_phone=patient.phone,
                asha_id=asha.id,
                health_update=random.choice(["Feeling better now", "Still has mild fever", "Medicines are working well", "Needs doctor consultation soon"]),
                symptoms="None reported",
                visit_requested=random.choice([True, False]),
                urgency=random.choice(["normal", "urgent"]),
                summary="Patient was called to check on their recent fever. They are feeling better but will continue the prescribed medication.",
                created_at=get_random_date(10, 0)
            )
            db.add(call)

    # Add 5 Appointments for the Doctor
    for _ in range(5):
        pat = random.choice(new_patients)
        appt_date = (datetime.utcnow() + timedelta(days=random.randint(1, 14))).strftime("%Y-%m-%d")
        time_slot = f"{random.randint(9, 16):02d}:00"
        
        appt = Appointment(
            doctor_id=doctor.id,
            patient_id=pat.id,
            patient_name=pat.name,
            patient_phone=pat.phone,
            appt_date=appt_date,
            time_slot=time_slot,
            reason="Follow-up check",
            status="confirmed",
            created_at=datetime.utcnow()
        )
        db.add(appt)

    db.commit()
    print("Demo data successfully populated!")

if __name__ == "__main__":
    populate_data()
