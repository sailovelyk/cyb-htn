"""
Risk classification engine.

Converts normalized anomaly scores and contextual signals into final risk levels.
All signals must be derived from actual available data - never fabricated.
"""
from typing import Optional
from app.core.config import settings


RISK_WEIGHTS = {
    "ml_score": 0.55,
    "auth_risk": 0.20,
    "privilege_risk": 0.15,
    "network_risk": 0.10,
}


def classify_risk_level(score: float) -> str:
    """Map a normalized score [0,1] to a risk level string."""
    if score <= settings.RISK_NORMAL_MAX:
        return "NORMAL"
    elif score <= settings.RISK_LOW_MAX:
        return "LOW"
    elif score <= settings.RISK_MEDIUM_MAX:
        return "MEDIUM"
    elif score <= settings.RISK_HIGH_MAX:
        return "HIGH"
    else:
        return "CRITICAL"


def compute_auth_risk(features: dict) -> Optional[float]:
    """
    Compute authentication risk from extracted features.
    Returns None if insufficient data is available.
    """
    failure_ratio = features.get("login_failure_ratio")
    failed_count = features.get("failed_login_count", 0)

    if failure_ratio is None and failed_count == 0:
        return None  # Not enough auth data

    risk = 0.0
    if failure_ratio is not None:
        # High failure ratio signals brute force
        risk += min(failure_ratio, 1.0) * 0.6
    if failed_count is not None and failed_count > 0:
        # Absolute count also matters
        risk += min(failed_count / 10.0, 1.0) * 0.4

    return min(risk, 1.0)


def compute_privilege_risk(features: dict) -> Optional[float]:
    """
    Compute privilege change risk.
    Returns None if the log has no privilege-related data.
    """
    privilege_changes = features.get("privilege_changes")
    if privilege_changes is None:
        return None

    return min(float(privilege_changes) / 3.0, 1.0)


def compute_network_risk(features: dict) -> Optional[float]:
    """
    Compute network anomaly risk.
    Returns None if no network data is available.
    """
    unique_dests = features.get("unique_destinations")
    connection_count = features.get("connection_count")

    if unique_dests is None and connection_count is None:
        return None

    risk = 0.0
    if unique_dests is not None:
        risk += min(unique_dests / 20.0, 1.0) * 0.5
    if connection_count is not None:
        risk += min(connection_count / 100.0, 1.0) * 0.5

    return min(risk, 1.0)


def compute_final_risk(ml_score: float, features: dict) -> dict:
    """
    Compute final risk score using weighted combination of available signals.

    The formula uses only signals that can actually be derived from the log data.
    Missing signals are excluded and weights are redistributed proportionally.

    Returns:
        dict with final_score, risk_level, signal breakdown, and explanation
    """
    auth_risk = compute_auth_risk(features)
    privilege_risk = compute_privilege_risk(features)
    network_risk = compute_network_risk(features)

    # Build weighted average using only available signals
    total_weight = RISK_WEIGHTS["ml_score"]
    weighted_sum = ml_score * RISK_WEIGHTS["ml_score"]

    if auth_risk is not None:
        total_weight += RISK_WEIGHTS["auth_risk"]
        weighted_sum += auth_risk * RISK_WEIGHTS["auth_risk"]

    if privilege_risk is not None:
        total_weight += RISK_WEIGHTS["privilege_risk"]
        weighted_sum += privilege_risk * RISK_WEIGHTS["privilege_risk"]

    if network_risk is not None:
        total_weight += RISK_WEIGHTS["network_risk"]
        weighted_sum += network_risk * RISK_WEIGHTS["network_risk"]

    final_score = weighted_sum / total_weight if total_weight > 0 else ml_score
    final_score = round(min(max(final_score, 0.0), 1.0), 4)

    return {
        "final_score": final_score,
        "risk_level": classify_risk_level(final_score),
        "signals": {
            "ml_score": round(ml_score, 4),
            "auth_risk": round(auth_risk, 4) if auth_risk is not None else None,
            "privilege_risk": round(privilege_risk, 4) if privilege_risk is not None else None,
            "network_risk": round(network_risk, 4) if network_risk is not None else None,
        },
    }


def generate_evidence(features: dict, signals: dict, log_record: dict) -> list:
    """
    Generate evidence list based on actual available data.
    NEVER invent signals not present in the data.
    """
    evidence = []
    ml_score = signals.get("ml_score", 0)

    if ml_score > 0.7:
        evidence.append(
            f"ML anomaly signal is elevated (normalized score: {ml_score:.2f}), "
            "indicating behavior that deviates significantly from baseline."
        )

    # Auth evidence
    failed = features.get("failed_login_count", 0)
    if failed and failed > 2:
        evidence.append(
            f"Multiple failed login attempts detected ({int(failed)} failures) "
            "prior to this event."
        )

    failure_ratio = features.get("login_failure_ratio")
    if failure_ratio and failure_ratio > 0.5:
        evidence.append(
            f"High login failure ratio ({failure_ratio:.0%}) suggests repeated "
            "authentication failures."
        )

    # Privilege evidence
    priv_changes = features.get("privilege_changes", 0)
    if priv_changes and priv_changes > 0:
        evidence.append(
            f"Privilege escalation or change detected ({int(priv_changes)} instance(s)). "
            "This warrants investigation."
        )

    # New IP / device
    new_ip = features.get("new_ip")
    if new_ip:
        evidence.append(
            "Event originated from an IP address not previously observed for this user."
        )

    new_device = features.get("new_device")
    if new_device:
        evidence.append(
            "Event originated from a device/hostname not previously observed for this user."
        )

    # Unusual hour
    login_hour = features.get("login_hour")
    if login_hour is not None and (login_hour < 6 or login_hour > 22):
        evidence.append(
            f"Activity occurred at an unusual hour ({int(login_hour):02d}:xx), "
            "outside typical business hours."
        )

    # Network
    unique_dests = features.get("unique_destinations")
    if unique_dests and unique_dests > 10:
        evidence.append(
            f"Unusually high number of unique network destinations ({int(unique_dests)}) "
            "observed in this session."
        )

    if not evidence:
        evidence.append("Insufficient evidence to explain this signal.")

    return evidence
