#!/usr/bin/env sh
# OWASP ZAP automated baseline scan against the AKG backend API.
#
# Usage:
#   ZAP_TARGET=https://staging.example.com/api/v1 ./backend/test/zap/zap-baseline.sh
#
# Runs the official ZAP baseline scanner in Docker, writes HTML + JSON reports
# to backend/test/zap/reports/, and fails (exit 1) if any HIGH-risk alert is
# reported. WARN-level alerts are surfaced but do not fail the scan.
set -eu

TARGET="${ZAP_TARGET:?set ZAP_TARGET to the base URL to scan (e.g. https://staging.example.com/api/v1)}"
REPORTS_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/reports" && pwd)"
IMAGE="${ZAP_IMAGE:-ghcr.io/zaproxy/zaproxy:stable}"

mkdir -p "$REPORTS_DIR"

docker run --rm \
  -v "$REPORTS_DIR:/zap/wrk/:rw" \
  -u zap \
  "$IMAGE" zap-baseline.py \
  -t "$TARGET" \
  -l WARN \
  -r zap-report.html \
  -J zap-report.json \
  -w zap-report.md \
  -x zap-report.xml

python3 - "$REPORTS_DIR/zap-report.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    data = json.load(f)

high = [a for a in data.get("site", []) if any(
    int(i.get("riskcode", 0)) >= 3 for i in a.get("alerts", [])
)]
if high:
    print(f"ZAP scan FAILED: {len(high)} HIGH-risk alert(s) reported.")
    sys.exit(1)
print("ZAP scan passed: no HIGH-risk alerts.")
PY
