from datetime import datetime, timedelta, timezone
from typing import List
from sqlmodel import Session, select
from backend.models import Hospital, Incident, BedHold, Prediction

def get_available_capacity(hospital: Hospital, resource_type: str) -> int:
    if resource_type == "icu":
        return hospital.icu_available
    elif resource_type == "ot":
        return hospital.ot_available
    return hospital.available_beds

def refresh_predictions(session: Session) -> List[Prediction]:
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    hospitals = session.exec(select(Hospital)).all()
    incidents = session.exec(select(Incident).where(Incident.status == "active")).all()
    active_holds = session.exec(select(BedHold).where(BedHold.status == "active")).all()

    active_incident_present = len(incidents) > 0
    predictions_out: List[Prediction] = []

    for h in hospitals:
        for r in ["bed", "icu", "ot"]:
            capacity = get_available_capacity(h, r)
            incoming = len([
                hold for hold in active_holds 
                if hold.hospital_id == h.id and hold.resource_type == r
            ])
            
            rate = 0.35 + incoming * 0.28 + (0.45 if active_incident_present else 0.0)

            series = []
            for i in range(7):
                t_minutes = i * 30
                projected = max(0, round(capacity - rate * i * (1 + i * 0.22)))
                series.append({
                    "t": f"+{t_minutes}m",
                    "projected": projected,
                    "capacity": capacity
                })

            breach_idx = next((i for i, s in enumerate(series) if s["projected"] <= 0), -1)
            predicted_shortfall_at = ""
            shortfall = 0
            if breach_idx != -1 and breach_idx > 0:
                shortfall_time = now + timedelta(minutes=breach_idx * 30)
                predicted_shortfall_at = shortfall_time.isoformat()
                shortfall = max(1, round(rate * breach_idx))

            confidence = round(min(0.92, 0.62 + incoming * 0.06), 2)
            pred_id = f"{h.id}-{r}"

            existing = session.exec(select(Prediction).where(Prediction.id == pred_id)).first()
            if existing:
                existing.predicted_shortfall_at = predicted_shortfall_at
                existing.shortfall = shortfall
                existing.confidence = confidence
                existing.generated_at = now_iso
                existing.series = series
                session.add(existing)
                predictions_out.append(existing)
            else:
                new_pred = Prediction(
                    id=pred_id,
                    hospital_id=h.id,
                    resource_type=r,
                    predicted_shortfall_at=predicted_shortfall_at,
                    shortfall=shortfall,
                    confidence=confidence,
                    generated_at=now_iso,
                    series=series
                )
                session.add(new_pred)
                predictions_out.append(new_pred)

    session.commit()
    return predictions_out

def minutes_to_saturation(session: Session, hospital_id: str, resource_type: str) -> float:
    pred = session.exec(
        select(Prediction).where(
            Prediction.hospital_id == hospital_id,
            Prediction.resource_type == resource_type
        )
    ).first()
    if not pred or not pred.predicted_shortfall_at:
        return float("inf")

    try:
        shortfall_dt = datetime.fromisoformat(pred.predicted_shortfall_at)
        now_dt = datetime.now(timezone.utc)
        diff_mins = (shortfall_dt - now_dt).total_seconds() / 60.0
        return max(0.0, diff_mins)
    except Exception:
        return float("inf")
