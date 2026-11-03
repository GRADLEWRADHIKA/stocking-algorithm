"""Import an OHLCV CSV dataset (data_source HISTORICAL_DATASET).

Usage:
    python -m app.scripts.import_dataset path/to/file.csv [--validate-only]
CSV columns: timestamp,open,high,low,close,volume,symbol,exchange
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from app.core.db import SessionLocal, create_all
from app.services.datasets import import_dataset, validate_dataset


def main() -> int:
    ap = argparse.ArgumentParser(description="Import an OHLCV CSV into QuantDesk")
    ap.add_argument("path")
    ap.add_argument("--validate-only", action="store_true")
    args = ap.parse_args()
    p = Path(args.path)
    if not p.exists():
        print(f"File not found: {p}", file=sys.stderr)
        return 2
    create_all()
    content = p.read_bytes()
    with SessionLocal() as db:
        rep = validate_dataset(db, content, p.name, None) if args.validate_only else import_dataset(db, content, p.name, None)
    print(json.dumps(rep, indent=2))
    return 0 if rep.get("is_valid") or rep.get("imported_rows") else 1


if __name__ == "__main__":
    raise SystemExit(main())
