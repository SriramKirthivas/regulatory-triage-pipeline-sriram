"""
Seed the database with deliberately messy regulatory data.

Run:  python seed.py            (drops + recreates all tables)

Every anomaly is injected on purpose and listed in MESSY_CASES so the
walkthrough can point at each one and at how app/triage.py handles it.
"""

from __future__ import annotations

import random
from datetime import date, timedelta

from sqlalchemy import text

from app.database import Base, SessionLocal, engine
from app.models import ActionItem, Authority, Directive

random.seed(42)
TODAY = date(2026, 9, 4)

MESSY_CASES = [
    "Missing effective_date on FINAL directives",
    "Missing published_at",
    "effective_date earlier than published_at",
    "comment_deadline before published_at",
    "Publication year 1970 (epoch default leaked from an upstream system)",
    "Status codes: 'RESOLVD', 'Pending ', 'In-Progress', 'IN_LIMBO', 'closed'",
    "Directive status 'Adopted', 'consultation', 'ACTIVE??'",
    "Severity 'HIGH', 'Med', 'sev1'",
    "Priority 0 and 9 (outside 1-5)",
    "Titles containing HTML markup, control characters, mojibake, only whitespace, 'N/A'",
    "Owner 'null' and 'TBD'",
    "Duplicate reference codes (same code, different casing/whitespace)",
    "Withdrawn directive that still has open action items",
    "Overdue open items and a due date in 2099",
    "Directive with zero action items",
]

AUTHORITIES = [
    ("European Medicines Agency", "EMA", "European Union", "Europe"),
    ("Health Products Regulatory Authority", "HPRA", "Ireland", "Europe"),
    ("Food and Drug Administration", "FDA", "United States", "North America"),
    ("Medicines and Healthcare products Regulatory Agency", "MHRA", "United Kingdom", "Europe"),
    ("Central Drugs Standard Control Organisation", "CDSCO", "India", "Asia"),
    ("Pharmaceuticals and Medical Devices Agency", "PMDA", "Japan", "Asia"),
    ("Health Canada", "HC", "Canada", "North America"),
    ("Therapeutic Goods Administration", "TGA", "Australia", "Oceania"),
]

CATEGORIES = ["GMP", "Pharmacovigilance", "Labelling", "Clinical Trials", "Market Authorisation", "Import/Export", "Data Integrity"]

TITLES = [
    "Revised guideline on {cat} inspections for sterile manufacturing sites",
    "Mandatory electronic submission of {cat} reports via the {acr} portal",
    "Transitional arrangements for {cat} following the {yr} annex update",
    "Notice of intent: tightened {cat} requirements for biologics",
    "Q&A on {cat} obligations for contract manufacturers",
    "Concept paper: risk-based {cat} oversight for ATMPs",
    "Consolidated {cat} variation procedures, version {v}",
    "{acr} position on {cat} for decentralised clinical trials",
    "Corrective action expectations after {cat} deficiency findings",
    "Harmonised {cat} data standards aligned with ICH M{n}",
]

ITEM_TEMPLATES = [
    "Gap-assess site SOPs against {code}",
    "Brief QA leads on {code} changes",
    "Update artwork template per {code}",
    "File variation for affected products under {code}",
    "Validate PV database export for {code} format",
    "Confirm CMO contractual coverage for {code}",
    "Schedule mock inspection covering {code}",
    "Draft response to consultation {code}",
    "Map {code} clauses to internal control register",
    "Train site staff on {code} requirements",
]

OWNERS = ["A. Byrne", "M. Okafor", "S. Ramanathan", "L. Chen", "J. Novak", "P. Walsh", "R. Iyer", "K. Sato"]
CLEAN_ITEM_STATUSES = ["pending", "pending", "pending", "in_progress", "in_progress", "blocked", "resolved", "resolved"]
CLEAN_DIR_STATUSES = ["draft", "open_for_comment", "final", "final", "final"]
CLEAN_SEVERITIES = ["critical", "major", "major", "minor", "info"]


def d(days: int) -> date:
    return TODAY + timedelta(days=days)


def main(*, reset: bool = True) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = SessionLocal()

    auths = [Authority(name=n, acronym=a, jurisdiction=j, region=r) for n, a, j, r in AUTHORITIES]
    db.add_all(auths)
    db.flush()

    directives: list[Directive] = []
    for i in range(44):
        auth = random.choice(auths)
        cat = random.choice(CATEGORIES)
        pub = d(-random.randint(5, 400))
        eff = pub + timedelta(days=random.randint(30, 365))
        deadline = pub + timedelta(days=random.randint(20, 90)) if random.random() < 0.5 else None
        title = random.choice(TITLES).format(cat=cat, acr=auth.acronym, yr=pub.year, v=random.randint(2, 7), n=random.randint(4, 13))
        directives.append(
            Directive(
                authority=auth,
                reference_code=f"{auth.acronym}/{cat[:3].upper()}/{pub.year}/{100 + i:03d}",
                title=title,
                summary=f"{auth.name} has issued guidance affecting {cat.lower()} obligations. "
                f"Marketing authorisation holders should assess impact before {eff.isoformat()}.",
                category=cat,
                severity=random.choice(CLEAN_SEVERITIES),
                status=random.choice(CLEAN_DIR_STATUSES),
                published_at=pub,
                effective_date=eff,
                comment_deadline=deadline,
            )
        )

    # ---- inject directive-level mess ----
    directives[0].effective_date = None; directives[0].status = "final"
    directives[1].effective_date = None; directives[1].status = "final"
    directives[2].published_at = None
    directives[3].effective_date = directives[3].published_at - timedelta(days=60)
    directives[4].comment_deadline = directives[4].published_at - timedelta(days=10)
    directives[5].published_at = date(1970, 1, 1)
    directives[6].status = "Adopted"
    directives[7].status = "consultation"
    directives[8].status = "ACTIVE??"
    directives[9].severity = "HIGH"
    directives[10].severity = "Med"
    directives[11].severity = "sev1"
    directives[12].title = "<b>Urgent:</b> revised <i>labelling</i> annex <script>alert(1)</script>"
    directives[13].title = "Guideline on\x07 data integrity\x08 for CSV\x1f systems"  # NB: Postgres rejects \x00 outright, so the seed cannot even contain it
    directives[14].title = "Annex 11 ���� revision (see attachment)"
    directives[15].title = "   "
    directives[16].title = "N/A"
    directives[17].reference_code = directives[16].reference_code  # exact duplicate
    directives[18].reference_code = " " + directives[19].reference_code.lower() + " "  # duplicate with casing/whitespace
    directives[20].status = "withdrawn"  # will get open items below
    directives[21].summary = None
    # directives[43] intentionally gets no action items

    db.add_all(directives)
    db.flush()

    items: list[ActionItem] = []
    for idx, dirv in enumerate(directives[:43]):
        for _ in range(random.randint(2, 6)):
            status = random.choice(CLEAN_ITEM_STATUSES)
            due = TODAY + timedelta(days=random.randint(3, 120))
            items.append(
                ActionItem(
                    directive=dirv,
                    title=random.choice(ITEM_TEMPLATES).format(code=dirv.reference_code.strip()),
                    owner=random.choice(OWNERS),
                    status=status,
                    priority=random.randint(1, 5),
                    due_date=due,
                )
            )

    # ---- inject item-level mess ----
    items[0].status = "RESOLVD"
    items[1].status = "Pending "
    items[2].status = "In-Progress"
    items[3].status = "IN_LIMBO"
    items[4].status = "closed"
    items[5].status = "wip"
    items[6].priority = 0
    items[7].priority = 9
    items[8].title = "Update <em>artwork</em> template &amp; resubmit"
    items[9].title = "Train staff on\x1b[31m new SOP"
    items[10].title = "TBD"
    items[11].owner = "null"
    items[12].owner = "TBD"
    items[13].owner = None
    items[14].due_date = None; items[14].status = "pending"
    items[15].due_date = None; items[15].status = "in_progress"
    items[16].due_date = date(2099, 12, 31)
    for it in items[17:24]:  # clearly overdue
        it.due_date = d(-random.randint(15, 120)); it.status = "pending"
    withdrawn_items = [it for it in items if it.directive is directives[20]]
    for it in withdrawn_items:
        it.status = "pending"  # conflict: withdrawn directive with open work

    db.add_all(items)
    db.commit()

    # Sequences are fine, but make sure ids are stable for the README examples.
    db.execute(text("ANALYZE"))
    db.commit()
    db.close()

    print(f"Seeded {len(auths)} authorities, {len(directives)} directives, {len(items)} action items.")
    print("Injected anomalies:")
    for c in MESSY_CASES:
        print("  -", c)


def seed_if_empty() -> bool:
    """Create the schema and populate it only if it has no rows yet.

    The deploy target is Render's free tier, which has no shell, so `python
    seed.py` cannot be run by hand after a deploy. This runs on startup instead
    (see SEED_ON_STARTUP) and, unlike main(), never drops anything — a redeploy
    of a populated database leaves recorded triage decisions alone.

    Returns True if it seeded, False if it found existing data.

    The advisory lock serialises boots that overlap, so a second process cannot
    read "empty" while the first is still inserting and seed a duplicate set.
    """
    Base.metadata.create_all(engine)

    with engine.connect() as conn:
        # Arbitrary constant; only has to be the same across instances of this app.
        conn.execute(text("select pg_advisory_lock(8721453)"))
        try:
            already = conn.execute(text("select count(*) from authorities")).scalar_one()
            if already:
                return False
            main(reset=False)
            return True
        finally:
            conn.execute(text("select pg_advisory_unlock(8721453)"))


if __name__ == "__main__":
    main()
