"""
Feature Engineering Module

Extracts meaningful behavioral features from normalized log records.
Every feature has a documented reason for existence.
Missing values are handled explicitly — never fabricated.
"""
import pandas as pd
import numpy as np
from typing import Optional
import re


# All features used by the ML model — order matters for inference
FEATURE_COLUMNS = [
    "login_hour",
    "failed_login_count",
    "successful_login_count",
    "login_failure_ratio",
    "unique_ips",
    "connection_count",
    "unique_destinations",
    "bytes_sent",
    "bytes_received",
    "privilege_changes",
    "files_accessed",
    "process_count",
    "event_type_encoded",
    "action_encoded",
    "status_encoded",
    "new_ip",
    "new_device",
]

# Categorical encodings
EVENT_TYPE_MAP = {
    "authentication": 1,
    "auth": 1,
    "login": 1,
    "logout": 2,
    "network": 3,
    "file_access": 4,
    "file": 4,
    "process": 5,
    "privilege": 6,
    "system": 7,
    "unknown": 0,
}

ACTION_MAP = {
    "login": 1,
    "logout": 2,
    "failed_login": 3,
    "file_read": 4,
    "file_write": 5,
    "file_delete": 6,
    "process_create": 7,
    "process_terminate": 8,
    "privilege_escalation": 9,
    "privilege_change": 9,
    "network_connect": 10,
    "network_disconnect": 11,
    "command_execution": 12,
    "unknown": 0,
}

STATUS_MAP = {
    "success": 1,
    "failure": 2,
    "failed": 2,
    "error": 3,
    "warning": 4,
    "unknown": 0,
}


def _safe_int(val, default=0) -> int:
    try:
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return default
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _safe_float(val, default=0.0) -> float:
    try:
        if val is None or (isinstance(val, float) and np.isnan(val)):
            return default
        return float(val)
    except (ValueError, TypeError):
        return default


def extract_features_from_record(record: dict) -> dict:
    """
    Extract ML features from a single normalized log record.

    Features are derived from actual record fields only.
    If a field is absent or unparseable, sensible defaults are used.

    Args:
        record: Normalized log record dict

    Returns:
        dict mapping feature_name -> numeric_value
    """
    features = {}
    metadata = record.get("metadata", {}) or {}

    # --- Temporal feature ---
    # login_hour: hour of the event (0-23), captures time-of-day anomalies
    timestamp = record.get("timestamp")
    if timestamp:
        try:
            if isinstance(timestamp, str):
                from datetime import datetime
                # Try multiple formats
                for fmt in ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"]:
                    try:
                        dt = datetime.strptime(timestamp[:19], fmt)
                        features["login_hour"] = dt.hour
                        break
                    except ValueError:
                        continue
                if "login_hour" not in features:
                    features["login_hour"] = 12  # default midday
            elif hasattr(timestamp, "hour"):
                features["login_hour"] = timestamp.hour
            else:
                features["login_hour"] = 12
        except Exception:
            features["login_hour"] = 12
    else:
        features["login_hour"] = 12

    # --- Authentication features ---
    # Reason: auth anomalies (brute force, cred stuffing) are core detection targets
    features["failed_login_count"] = _safe_int(metadata.get("failed_login_count", 0))
    features["successful_login_count"] = _safe_int(metadata.get("successful_login_count", 0))

    # Calculate failure ratio: failures / (total attempts)
    total_attempts = features["failed_login_count"] + features["successful_login_count"]
    if total_attempts > 0:
        features["login_failure_ratio"] = features["failed_login_count"] / total_attempts
    else:
        # Infer from event type / action / status
        action = (record.get("action") or "").lower()
        status = (record.get("status") or "").lower()
        event_type = (record.get("event_type") or "").lower()

        if "fail" in action or "fail" in status:
            features["failed_login_count"] = max(features["failed_login_count"], 1)
            features["login_failure_ratio"] = 1.0
        elif ("login" in event_type or "auth" in event_type) and "success" in status:
            features["login_failure_ratio"] = 0.0
        else:
            features["login_failure_ratio"] = 0.0

    # unique_ips: number of unique source IPs seen (from metadata or inferred)
    features["unique_ips"] = _safe_int(metadata.get("unique_ips", 1))

    # --- Network features ---
    # Reason: unusual network patterns can indicate C2, data exfiltration, lateral movement
    features["connection_count"] = _safe_int(metadata.get("connection_count", 0))
    features["unique_destinations"] = _safe_int(metadata.get("unique_destinations", 0))
    features["bytes_sent"] = _safe_float(metadata.get("bytes_sent", 0.0))
    features["bytes_received"] = _safe_float(metadata.get("bytes_received", 0.0))

    # --- Privilege features ---
    # Reason: privilege escalation is a key lateral movement / persistence indicator
    features["privilege_changes"] = _safe_int(metadata.get("privilege_changes", 0))
    action_str = (record.get("action") or "").lower()
    if "privilege" in action_str or "escalat" in action_str or "sudo" in action_str:
        features["privilege_changes"] = max(features["privilege_changes"], 1)

    # --- File & process features ---
    features["files_accessed"] = _safe_int(metadata.get("files_accessed", 0))
    if "file" in action_str:
        features["files_accessed"] = max(features["files_accessed"], 1)

    features["process_count"] = _safe_int(metadata.get("process_count", 0))
    if "process" in action_str:
        features["process_count"] = max(features["process_count"], 1)

    # --- Categorical features (encoded as integers) ---
    event_type_raw = (record.get("event_type") or "unknown").lower().strip()
    features["event_type_encoded"] = EVENT_TYPE_MAP.get(event_type_raw, 0)

    action_raw = (record.get("action") or "unknown").lower().strip()
    # normalize action
    action_key = action_raw.replace(" ", "_").replace("-", "_")
    features["action_encoded"] = ACTION_MAP.get(action_key, 0)
    if features["action_encoded"] == 0:
        # partial match
        for key, val in ACTION_MAP.items():
            if key in action_key or action_key in key:
                features["action_encoded"] = val
                break

    status_raw = (record.get("status") or "unknown").lower().strip()
    features["status_encoded"] = STATUS_MAP.get(status_raw, 0)

    # --- Behavioral indicators ---
    # new_ip: flag if IP appears novel (from metadata)
    features["new_ip"] = _safe_int(metadata.get("new_ip", 0))
    features["new_device"] = _safe_int(metadata.get("new_device", 0))

    return features


def features_to_vector(features: dict) -> list:
    """Convert feature dict to a fixed-length vector in FEATURE_COLUMNS order."""
    return [features.get(col, 0.0) for col in FEATURE_COLUMNS]


def features_dataframe(records: list) -> pd.DataFrame:
    """Build a DataFrame from a list of normalized log records."""
    rows = [extract_features_from_record(r) for r in records]
    df = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
    # Fill any remaining NaN with 0
    df = df.fillna(0.0)
    return df
