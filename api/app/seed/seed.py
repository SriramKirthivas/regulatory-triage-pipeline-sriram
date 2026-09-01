"""Seed the database by pushing the raw mock feed through the real ingest pipeline.

This script deliberately does NOT insert pre-cleaned rows. It hands the dirty
records in `raw_data.py` to the same normalisation functions the API would use for
live ingestion, so the DataQualityFlag rows in the seeded database are genuinely
*discovered*, not authored. The `_defect` annotations in the raw data are stripped
before ingestion and never consulted.

Usage:
    python -m app.seed.seed            # seed if empty (safe to re-run)
    python -m app.seed.seed --reset    # drop everything and reseed
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal, engine
from ..models import (
    ActionItem,
    Base,
    ComplianceDirective,
    DataQualityFlag,
    FlagSeverity,
    RegulatoryAuthority,
)
from ..normalize import (
    FindingCollector,
    check_date_order,
    check_reference_code,
    check_status_consistency,
    clean_text,
    coerce_action_status,
    coerce_directive_status,
    coerce_priority,
    parse_date,
)
from .raw_data import AUTHORITIES, DIRECTIVES


def _flag_rows(
    findings: list, directive_id: int, action_item_id: int | None = None
) -> list[DataQualityFlag]:
    return [
        DataQualityFlag(
            directive_id=directive_id,
            action_item_id=action_item_id,
            field=f.field,
            issue=f.issue,
            severity=f.severity,
            message=f.message,
            raw_value=f.raw_value,
        )
        for f in findings
    ]


def ingest_directive(
    db: Session,
    raw: dict,
    authorities: dict[str, RegulatoryAuthority],
    seen_codes: dict[str, int],
) -> tuple[ComplianceDirective, int]:
    """Normalise one raw record into persisted rows plus its quality flags."""
    payload = {k: v for k, v in raw.items() if k != "_defect"}
    collector = FindingCollector()

    reference_code = clean_text(payload.get("reference_code"), "reference_code")
    check_reference_code(reference_code, seen_codes, collector)

    title = clean_text(payload.get("title"), "title", collector=collector, max_length=490)
    summary = clean_text(payload.get("summary"), "summary", collector=collector)

    # A directive with no usable title still has to be triageable, so we substitute
    # a traceable placeholder rather than rejecting the record.
    if not title:
        title = f"[untitled directive — {reference_code or 'no reference code'}]"

    published = parse_date(
        payload.get("published_date"),
        "published_date",
        collector=collector,
        required=True,
        severity_if_missing=FlagSeverity.WARNING,
    )
    effective = parse_date(
        payload.get("effective_date"),
        "effective_date",
        collector=collector,
        required=True,
        # No effective date means nobody can schedule the compliance work.
        severity_if_missing=FlagSeverity.CRITICAL,
    )
    check_date_order(published, effective, collector)

    status = coerce_directive_status(payload.get("status"), collector)

    directive = ComplianceDirective(
        authority_id=authorities[payload["authority"]].id,
        reference_code=reference_code,
        title=title,
        summary=summary,
        status=status,
        document_type=clean_text(payload.get("document_type"), "document_type"),
        therapeutic_area=clean_text(payload.get("therapeutic_area"), "therapeutic_area"),
        source_url=clean_text(payload.get("source_url"), "source_url"),
        published_date=published,
        effective_date=effective,
        raw_payload=payload,
    )
    db.add(directive)
    db.flush()  # assign directive.id for the flag foreign keys

    item_findings: list[tuple[ActionItem, list]] = []
    action_statuses = []

    for raw_item in payload.get("action_items", []):
        item_collector = FindingCollector()

        item_status = coerce_action_status(raw_item.get("status"), item_collector)
        action_statuses.append(item_status)

        item = ActionItem(
            directive_id=directive.id,
            title=clean_text(
                raw_item.get("title"), "action_item.title", collector=item_collector,
                max_length=390,
            )
            or "[untitled action item]",
            description=clean_text(
                raw_item.get("description"), "action_item.description",
                collector=item_collector,
            ),
            owner=clean_text(raw_item.get("owner"), "action_item.owner"),
            status=item_status,
            priority=coerce_priority(raw_item.get("priority"), item_collector),
            due_date=parse_date(
                raw_item.get("due_date"),
                "action_item.due_date",
                collector=item_collector,
                required=False,
            ),
        )
        db.add(item)
        item_findings.append((item, item_collector.findings))

    db.flush()  # assign action_item.id

    # Cross-record check: individually valid rows, collectively contradictory.
    check_status_consistency(status, action_statuses, collector)

    flags = _flag_rows(collector.findings, directive.id)
    for item, findings in item_findings:
        flags.extend(_flag_rows(findings, directive.id, item.id))

    db.add_all(flags)
    return directive, len(flags)


def seed(reset: bool = False) -> None:
    if reset:
        print("Dropping existing schema…")
        Base.metadata.drop_all(engine)

    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        existing = db.scalar(select(ComplianceDirective).limit(1))
        if existing and not reset:
            print("Database already seeded — nothing to do. Use --reset to reseed.")
            return

        authorities: dict[str, RegulatoryAuthority] = {}
        for spec in AUTHORITIES:
            authority = RegulatoryAuthority(**spec)
            db.add(authority)
            authorities[spec["code"]] = authority
        db.flush()

        seen_codes: dict[str, int] = {}
        total_flags = 0
        for raw in DIRECTIVES:
            _, flag_count = ingest_directive(db, raw, authorities, seen_codes)
            total_flags += flag_count

        db.commit()

        print(
            f"Seeded {len(AUTHORITIES)} authorities and {len(DIRECTIVES)} directives. "
            f"The ingest pipeline detected {total_flags} data-quality issues."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the regulatory triage database.")
    parser.add_argument(
        "--reset", action="store_true", help="Drop all tables before seeding."
    )
    args = parser.parse_args()
    seed(reset=args.reset)
    return 0


if __name__ == "__main__":
    sys.exit(main())
