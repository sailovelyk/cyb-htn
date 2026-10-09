"""
Log Preprocessing and Normalization

Converts raw uploaded log files (CSV, JSON, TXT, LOG) into the internal
normalized log schema. Security-validated, injection-safe parsing.

Internal schema:
{
    "timestamp": str | None,
    "user": str | None,
    "ip": str | None,
    "hostname": str | None,
    "event_type": str | None,
    "action": str | None,
    "status": str | None,
    "source": str,
    "metadata": dict
}
"""
import csv
import json
import io
import re
import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

MAX_FIELD_LENGTH = 1024
ALLOWED_EXTENSIONS = {".csv", ".json", ".txt", ".log"}

# Regex for basic IP validation (IPv4)
IP_PATTERN = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
)

# Security: block CSV formula injection prefixes
CSV_INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def _sanitize_string(value) -> Optional[str]:
    """Sanitize a string value — truncate, strip dangerous chars."""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in ("null", "none", "nan", "n/a", ""):
        return None
    # Block CSV injection
    if s.startswith(CSV_INJECTION_PREFIXES):
        s = "'" + s  # prefix to defuse
    # Truncate to max length
    return s[:MAX_FIELD_LENGTH]


def _parse_timestamp(raw: Optional[str]) -> Optional[str]:
    """Parse and normalize timestamp to ISO 8601 string."""
    if not raw:
        return None
    raw = str(raw).strip()
    formats = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(raw[:26], fmt)
            return dt.replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return raw  # return as-is if parsing fails


def _normalize_record(raw: dict, source_format: str) -> dict:
    """
    Map a raw record dict to the internal normalized schema.
    Unknown fields are placed in metadata.
    """
    # Known field name aliases
    FIELD_ALIASES = {
        "timestamp": ["timestamp", "time", "datetime", "date_time", "ts", "event_time", "log_time"],
        "user": ["user", "username", "user_name", "user_id", "userid", "account", "principal"],
        "ip": ["ip", "ip_address", "source_ip", "src_ip", "client_ip", "remote_ip", "ipaddress"],
        "hostname": ["hostname", "host", "machine", "computer", "device", "server", "host_name"],
        "event_type": ["event_type", "eventtype", "type", "category", "log_type", "event_category"],
        "action": ["action", "event", "activity", "operation", "cmd", "command", "event_name"],
        "status": ["status", "result", "outcome", "state", "success"],
    }

    # Normalize keys to lowercase
    raw_lower = {k.lower().strip(): v for k, v in raw.items()}

    normalized = {
        "source": source_format,
        "metadata": {},
    }

    # Map known fields
    for canonical, aliases in FIELD_ALIASES.items():
        for alias in aliases:
            if alias in raw_lower:
                val = raw_lower[alias]
                if canonical == "timestamp":
                    normalized[canonical] = _parse_timestamp(str(val) if val else None)
                else:
                    normalized[canonical] = _sanitize_string(val)
                break
        else:
            normalized[canonical] = None

    # Collect remaining fields into metadata
    known_keys = set()
    for aliases in FIELD_ALIASES.values():
        known_keys.update(aliases)

    for key, val in raw_lower.items():
        if key not in known_keys:
            sanitized = _sanitize_string(val)
            if sanitized is not None:
                try:
                    normalized["metadata"][key] = float(sanitized) if _is_numeric(sanitized) else sanitized
                except Exception:
                    normalized["metadata"][key] = sanitized

    # Ensure timestamp exists (default to now if missing)
    if not normalized.get("timestamp"):
        normalized["timestamp"] = datetime.now(timezone.utc).isoformat()

    return normalized


def _is_numeric(s: str) -> bool:
    try:
        float(s)
        return True
    except (ValueError, TypeError):
        return False


def _validate_record(record: dict) -> Tuple[bool, str]:
    """Basic validation — check at least one identifying field is present."""
    has_data = any([
        record.get("user"),
        record.get("ip"),
        record.get("hostname"),
        record.get("event_type"),
        record.get("action"),
    ])
    if not has_data:
        return False, "Record has no identifiable fields"
    return True, ""


def parse_csv(content: bytes) -> Tuple[List[dict], List[str]]:
    """Parse CSV log file. Returns (records, errors)."""
    records = []
    errors = []

    try:
        text = content.decode("utf-8-sig", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            return [], ["CSV file has no headers"]

        for i, row in enumerate(reader):
            try:
                norm = _normalize_record(dict(row), "csv")
                valid, err = _validate_record(norm)
                if valid:
                    records.append(norm)
                else:
                    errors.append(f"Row {i+1}: {err}")
            except Exception as e:
                errors.append(f"Row {i+1}: parse error — {e}")

    except Exception as e:
        return [], [f"CSV parse error: {e}"]

    return records, errors


def parse_json(content: bytes) -> Tuple[List[dict], List[str]]:
    """Parse JSON log file (array or newline-delimited). Returns (records, errors)."""
    records = []
    errors = []

    try:
        text = content.decode("utf-8", errors="replace").strip()

        # Try array first
        if text.startswith("["):
            raw_records = json.loads(text)
            if not isinstance(raw_records, list):
                return [], ["JSON root must be an array"]
        else:
            # Newline-delimited JSON
            raw_records = []
            for i, line in enumerate(text.splitlines()):
                line = line.strip()
                if not line:
                    continue
                try:
                    raw_records.append(json.loads(line))
                except json.JSONDecodeError as e:
                    errors.append(f"Line {i+1}: JSON parse error — {e}")

        for i, raw in enumerate(raw_records):
            try:
                if not isinstance(raw, dict):
                    errors.append(f"Record {i+1}: not an object")
                    continue
                norm = _normalize_record(raw, "json")
                valid, err = _validate_record(norm)
                if valid:
                    records.append(norm)
                else:
                    errors.append(f"Record {i+1}: {err}")
            except Exception as e:
                errors.append(f"Record {i+1}: error — {e}")

    except Exception as e:
        return [], [f"JSON parse error: {e}"]

    return records, errors


def parse_text_log(content: bytes) -> Tuple[List[dict], List[str]]:
    """
    Parse plain text / syslog-style logs.
    Attempts to extract common fields via pattern matching.
    """
    records = []
    errors = []

    # Common syslog pattern: timestamp hostname process[pid]: message
    SYSLOG_PATTERN = re.compile(
        r"(?P<timestamp>\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>\S+)\s+"
        r"(?P<process>\S+?)(?:\[(?P<pid>\d+)\])?\s*:\s*"
        r"(?P<message>.+)"
    )

    try:
        text = content.decode("utf-8", errors="replace")
        lines = text.splitlines()

        for i, line in enumerate(lines):
            line = line.strip()
            if not line or line.startswith("#"):
                continue

            m = SYSLOG_PATTERN.match(line)
            if m:
                msg = m.group("message").lower()
                # Infer event type from message
                event_type = "system"
                action = "unknown"
                status = "unknown"

                if any(k in msg for k in ["login", "auth", "password", "pam", "session"]):
                    event_type = "authentication"
                    if "fail" in msg or "invalid" in msg or "error" in msg:
                        action = "failed_login"
                        status = "failure"
                    elif "accept" in msg or "success" in msg or "opened" in msg:
                        action = "login"
                        status = "success"
                    elif "closed" in msg or "disconnect" in msg:
                        action = "logout"
                        status = "success"
                elif any(k in msg for k in ["connect", "network", "port"]):
                    event_type = "network"
                    action = "network_connect"
                    status = "success"
                elif any(k in msg for k in ["file", "read", "write", "open", "access"]):
                    event_type = "file_access"
                    action = "file_read"
                    status = "success"
                elif any(k in msg for k in ["process", "exec", "spawn", "fork"]):
                    event_type = "process"
                    action = "process_create"
                    status = "success"

                # Try to extract IP from message
                ip_match = re.search(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b", line)
                ip = ip_match.group(1) if ip_match else None

                # Try to extract user from message
                user_match = re.search(
                    r"(?:user|for|by)\s+([a-zA-Z0-9_\-\.]+)", msg, re.IGNORECASE
                )
                user = _sanitize_string(user_match.group(1)) if user_match else None

                record = {
                    "timestamp": _parse_timestamp(m.group("timestamp")),
                    "user": user,
                    "ip": ip,
                    "hostname": _sanitize_string(m.group("hostname")),
                    "event_type": event_type,
                    "action": action,
                    "status": status,
                    "source": "log",
                    "metadata": {
                        "process": _sanitize_string(m.group("process")),
                        "raw_message": line[:512],
                    },
                }
                valid, err = _validate_record(record)
                if valid:
                    records.append(record)
                else:
                    errors.append(f"Line {i+1}: {err}")
            else:
                # Minimal parsing for unstructured lines
                if len(line) < 5:
                    continue
                ip_match = re.search(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b", line)
                record = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "user": None,
                    "ip": ip_match.group(1) if ip_match else None,
                    "hostname": None,
                    "event_type": "system",
                    "action": "unknown",
                    "status": "unknown",
                    "source": "log",
                    "metadata": {"raw_message": line[:512]},
                }
                valid, _ = _validate_record(record)
                if valid:
                    records.append(record)

    except Exception as e:
        return [], [f"Text log parse error: {e}"]

    return records, errors


def parse_logs(content: bytes, filename: str) -> Tuple[List[dict], List[str]]:
    """
    Main entry point for log parsing.
    Dispatches to the appropriate parser based on file extension.
    """
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ".unknown"

    if ext == ".csv":
        return parse_csv(content)
    elif ext == ".json":
        return parse_json(content)
    elif ext in (".txt", ".log"):
        return parse_text_log(content)
    else:
        return [], [f"Unsupported file extension: {ext}"]
