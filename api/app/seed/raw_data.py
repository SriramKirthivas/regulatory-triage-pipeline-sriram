"""The mock dataset, in its raw — deliberately dirty — form.

Every record here is written the way a real upstream feed would hand it over:
inconsistent key casing is avoided for readability, but the *values* carry the
full range of real-world defects. The `_defect` key on each record is
documentation only; the seeder strips it before ingestion and the pipeline is
never told what to look for. It has to find the problems on its own.

Anomaly catalogue (see README for the full table):
  D1  missing effective date
  D2  unparseable date ("2024-13-45")
  D3  human-written date ("March 3rd, 2024")
  D4  effective date precedes published date
  D5  mojibake / double-encoded HTML entities in text
  D6  embedded HTML markup in summary
  D7  unrecognised status vocabulary
  D8  duplicate reference code across records
  D9  missing reference code
  D10 directive CLOSED while action items remain open
  D11 out-of-enum priority ("URGENT!!!")
  D12 upstream truncation marker
  D13 title that is only markup / whitespace
  D14 draft directive with already-resolved work
"""

AUTHORITIES = [
    {
        "code": "FDA",
        "name": "U.S. Food and Drug Administration",
        "jurisdiction": "United States",
        "region": "North America",
    },
    {
        "code": "EMA",
        "name": "European Medicines Agency",
        "jurisdiction": "European Union",
        "region": "Europe",
    },
    {
        "code": "MHRA",
        "name": "Medicines and Healthcare products Regulatory Agency",
        "jurisdiction": "United Kingdom",
        "region": "Europe",
    },
    {
        "code": "PMDA",
        "name": "Pharmaceuticals and Medical Devices Agency",
        "jurisdiction": "Japan",
        "region": "Asia-Pacific",
    },
    {
        "code": "CDSCO",
        "name": "Central Drugs Standard Control Organisation",
        "jurisdiction": "India",
        "region": "Asia-Pacific",
    },
    {
        "code": "HC",
        "name": "Health Canada",
        "jurisdiction": "Canada",
        "region": "North America",
    },
]


DIRECTIVES = [
    # ---------------------------------------------------------------- clean --
    {
        "_defect": None,
        "authority": "FDA",
        "reference_code": "FDA-2024-N-0117",
        "title": "Guidance for Industry: Bioequivalence Studies for Oral Solid Dosage Forms",
        "summary": "Updated expectations for in vivo bioequivalence study design, including revised statistical criteria for highly variable drug products.",
        "status": "Active",
        "document_type": "Guidance",
        "therapeutic_area": "General",
        "source_url": "https://www.fda.gov/regulatory-information/example/0117",
        "published_date": "2024-02-14",
        "effective_date": "2024-05-01",
        "action_items": [
            {
                "title": "Review current BE study protocols against revised criteria",
                "description": "Cross-check all in-flight ANDA submissions.",
                "owner": "R. Mehta",
                "status": "In Review",
                "priority": "High",
                "due_date": "2024-04-15",
            },
            {
                "title": "Update SOP-BE-004 to reference new statistical thresholds",
                "description": None,
                "owner": "L. Chen",
                "status": "Pending",
                "priority": "Medium",
                "due_date": "2024-04-30",
            },
        ],
    },
    # ------------------------------------------------ D1 missing effective ---
    {
        "_defect": "D1 missing effective date",
        "authority": "EMA",
        "reference_code": "EMA/CHMP/442/2024",
        "title": "Reflection Paper on the Use of Real-World Evidence in Marketing Authorisation Applications",
        "summary": "Sets out CHMP thinking on when real-world evidence may substitute for randomised controlled trial data.",
        "status": "Published",
        "document_type": "Reflection Paper",
        "therapeutic_area": "Oncology",
        "source_url": "https://www.ema.europa.eu/example/442",
        "published_date": "2024-03-08",
        "effective_date": None,
        "action_items": [
            {
                "title": "Assess RWE readiness across oncology portfolio",
                "description": "No effective date published — treat timeline as unconfirmed.",
                "owner": "S. Okafor",
                "status": "Pending",
                "priority": "High",
                "due_date": None,
            }
        ],
    },
    # -------------------------------------------- D2 unparseable date + D11 ---
    {
        "_defect": "D2 unparseable date; D11 out-of-enum priority",
        "authority": "MHRA",
        "reference_code": "MHRA-GN-2024-19",
        "title": "Post-Brexit Requirements for UKCA Marking of Medical Devices",
        "summary": "Transitional arrangements for devices previously CE-marked under EU MDR.",
        "status": "In Force",
        "document_type": "Guidance Note",
        "therapeutic_area": "Medical Devices",
        "source_url": "https://www.gov.uk/example/gn-2024-19",
        "published_date": "2024-01-22",
        "effective_date": "2024-13-45",
        "action_items": [
            {
                "title": "Inventory all CE-marked devices requiring UKCA transition",
                "description": "Effective date could not be parsed upstream — confirm with regulatory affairs before committing to a plan.",
                "owner": "T. Whitfield",
                "status": "In Progress",
                "priority": "URGENT!!!",
                "due_date": "2024-06-30",
            }
        ],
    },
    # --------------------------------------------- D3 human-written date -----
    {
        "_defect": "D3 human-written date",
        "authority": "FDA",
        "reference_code": "FDA-2024-D-0891",
        "title": "Draft Guidance: Decentralized Clinical Trials for Drugs, Biological Products, and Devices",
        "summary": "Recommendations for sponsors conducting trial activities at locations other than traditional clinical trial sites.",
        "status": "Draft",
        "document_type": "Draft Guidance",
        "therapeutic_area": "Clinical Operations",
        "source_url": "https://www.fda.gov/example/dct-draft",
        "published_date": "March 3rd, 2024",
        "effective_date": None,
        "action_items": [
            {
                "title": "Submit public comment before docket closes",
                "description": None,
                "owner": "R. Mehta",
                "status": "Resolved",
                "priority": "Medium",
                "due_date": "2024-05-02",
            }
        ],
    },
    # --------------------------------------- D4 effective before published ---
    {
        "_defect": "D4 effective date precedes published date",
        "authority": "PMDA",
        "reference_code": "PMDA-PSEHB-0330",
        "title": "Partial Revision of the Ministerial Ordinance on Good Manufacturing Practice",
        "summary": "Amends GMP ordinance articles concerning data integrity and electronic batch records.",
        "status": "Active",
        "document_type": "Ministerial Ordinance",
        "therapeutic_area": "Manufacturing",
        "source_url": "https://www.pmda.go.jp/example/0330",
        "published_date": "2024-04-18",
        "effective_date": "2024-01-10",
        "action_items": [
            {
                "title": "Gap-assess Kobe site against revised data integrity articles",
                "description": "Retroactive effective date — legal review required to determine actual obligation start.",
                "owner": "K. Tanaka",
                "status": "Blocked",
                "priority": "Critical",
                "due_date": "2024-05-20",
            }
        ],
    },
    # ------------------------------------- D5 mojibake + D6 embedded HTML ----
    {
        "_defect": "D5 mojibake and double-encoded entities; D6 embedded HTML",
        "authority": "EMA",
        "reference_code": "EMA/INS/GMP/1188/2024",
        "title": "Q&amp;amp;A on Nitrosamine Impurities â€” Revision 18",
        "summary": "<p>Updated <strong>acceptable intake</strong> limits for N-nitrosodimethylamine (NDMA).</p><p>Applies to all marketing authorisation holders&amp;#8212;including generics.</p>",
        "status": "Active",
        "document_type": "Q&A",
        "therapeutic_area": "Impurities",
        "source_url": "https://www.ema.europa.eu/example/1188",
        "published_date": "2024-05-30",
        "effective_date": "2024-07-01",
        "action_items": [
            {
                "title": "Re-run nitrosamine risk assessment for sartan portfolio",
                "description": "Rev 18 tightens the NDMA limit.",
                "owner": "S. Okafor",
                "status": "In Review",
                "priority": "Critical",
                "due_date": "2024-06-25",
            },
            {
                "title": "Notify contract manufacturers of revised AI limits",
                "description": None,
                "owner": None,
                "status": "Pending",
                "priority": "High",
                "due_date": "2024-07-10",
            },
        ],
    },
    # ------------------------------------------ D7 unrecognised status -------
    {
        "_defect": "D7 unrecognised status vocabulary",
        "authority": "CDSCO",
        "reference_code": "CDSCO-NOC-2024-556",
        "title": "Revised Requirements for Import Licence Applications (Form MD-14)",
        "summary": "Consolidates documentation requirements for medical device import licences.",
        "status": "PARTIALLY_RESCINDED_SEE_ANNEX_C",
        "document_type": "Circular",
        "therapeutic_area": "Medical Devices",
        "source_url": "https://cdsco.gov.in/example/556",
        "published_date": "2024-06-11",
        "effective_date": "2024-08-01",
        "action_items": [
            {
                "title": "Determine which annexes remain in force",
                "description": "Source status code is not a recognised lifecycle state.",
                "owner": "A. Nair",
                "status": "Pending",
                "priority": "High",
                "due_date": None,
            }
        ],
    },
    # ------------------------------- D8 duplicate reference code (first) -----
    {
        "_defect": "D8 duplicate reference code (first occurrence)",
        "authority": "FDA",
        "reference_code": "FDA-2024-N-0117",
        "title": "Guidance for Industry: Bioequivalence Studies — Correction Notice",
        "summary": "Corrects a typographical error in Table 3 of the February guidance.",
        "status": "Active",
        "document_type": "Correction",
        "therapeutic_area": "General",
        "source_url": "https://www.fda.gov/example/0117-correction",
        "published_date": "2024-03-01",
        "effective_date": "2024-05-01",
        "action_items": [
            {
                "title": "Confirm Table 3 correction does not change our submissions",
                "description": None,
                "owner": "L. Chen",
                "status": "Resolved",
                "priority": "Low",
                "due_date": "2024-03-20",
            }
        ],
    },
    # --------------------------------------- D9 missing reference code -------
    {
        "_defect": "D9 missing reference code; D12 truncation marker",
        "authority": "MHRA",
        "reference_code": "",
        "title": "Safety Alert: Batch Recall of Contaminated Heparin Sodium Injection",
        "summary": "Immediate recall of affected lots following detection of oversulfated chondroitin sulfate. Distributors must quarantine remaining stock and… [truncated]",
        "status": "Active",
        "document_type": "Safety Alert",
        "therapeutic_area": "Anticoagulants",
        "source_url": "https://www.gov.uk/example/heparin-recall",
        "published_date": "2024-07-02",
        "effective_date": "2024-07-02",
        "action_items": [
            {
                "title": "Quarantine affected heparin lots at all distribution centres",
                "description": "Recall scope is incomplete in the source record — obtain the full lot list before closing.",
                "owner": "T. Whitfield",
                "status": "In Progress",
                "priority": "P1",
                "due_date": "2024-07-04",
            }
        ],
    },
    # ------------------------- D10 CLOSED directive with open action items ---
    {
        "_defect": "D10 conflicting status: CLOSED directive, open action items",
        "authority": "HC",
        "reference_code": "HC-POL-2023-0042",
        "title": "Policy on Plain Language Labelling for Prescription Drugs",
        "summary": "Requires plain language labelling and a standardised Drug Facts Table for prescription products.",
        "status": "Closed",
        "document_type": "Policy",
        "therapeutic_area": "Labelling",
        "source_url": "https://www.canada.ca/example/pll-0042",
        "published_date": "2023-11-15",
        "effective_date": "2024-01-15",
        "action_items": [
            {
                "title": "Redesign cartons for 14 remaining SKUs",
                "description": "Still outstanding despite the directive being marked closed upstream.",
                "owner": "M. Dubois",
                "status": "Pending",
                "priority": "High",
                "due_date": "2024-02-28",
            },
            {
                "title": "Obtain Health Canada sign-off on revised Drug Facts Tables",
                "description": None,
                "owner": "M. Dubois",
                "status": "Blocked",
                "priority": "Critical",
                "due_date": None,
            },
            {
                "title": "Archive superseded label artwork",
                "description": None,
                "owner": "M. Dubois",
                "status": "Done",
                "priority": "Low",
                "due_date": "2024-01-05",
            },
        ],
    },
    # ---------------------------------- D13 title that is only markup --------
    {
        "_defect": "D13 title is only markup/whitespace",
        "authority": "PMDA",
        "reference_code": "PMDA-SGL-2024-77",
        "title": "<div class='title'>   </div>",
        "summary": "Notification regarding electronic submission of periodic safety update reports via the Gateway system.",
        "status": "active",
        "document_type": "Notification",
        "therapeutic_area": "Pharmacovigilance",
        "source_url": "https://www.pmda.go.jp/example/sgl-77",
        "published_date": "2024-08-05",
        "effective_date": "2024-10-01",
        "action_items": [
            {
                "title": "Register for Gateway electronic submission credentials",
                "description": None,
                "owner": "K. Tanaka",
                "status": "Pending",
                "priority": "Medium",
                "due_date": "2024-09-15",
            }
        ],
    },
    # ------------------ D14 draft directive with already-resolved work -------
    {
        "_defect": "D14 DRAFT directive with resolved action items; D1 missing dates",
        "authority": "EMA",
        "reference_code": "EMA/CHMP/9910/2024",
        "title": "Draft Guideline on Quality Requirements for Drug-Device Combination Products",
        "summary": "Consultation draft. Comments accepted until the consultation window closes.",
        "status": "Consultation",
        "document_type": "Draft Guideline",
        "therapeutic_area": "Combination Products",
        "source_url": "https://www.ema.europa.eu/example/9910",
        "published_date": None,
        "effective_date": "TBD",
        "action_items": [
            {
                "title": "Implement revised device constituent testing",
                "description": "Marked complete against a directive that is still a consultation draft.",
                "owner": "S. Okafor",
                "status": "Completed",
                "priority": "Medium",
                "due_date": "2024-09-01",
            },
            {
                "title": "Draft consultation response",
                "description": None,
                "owner": None,
                "status": "",
                "priority": None,
                "due_date": "not specified",
            },
        ],
    },
    # ----------------------------------------------------- more clean rows ---
    {
        "_defect": None,
        "authority": "FDA",
        "reference_code": "FDA-2024-N-1204",
        "title": "Establishment Registration and Drug Listing Electronic Submission Requirements",
        "summary": "Annual registration renewal window and SPL submission format updates.",
        "status": "Active",
        "document_type": "Rule",
        "therapeutic_area": "General",
        "source_url": "https://www.fda.gov/example/1204",
        "published_date": "2024-09-12",
        "effective_date": "2024-12-31",
        "action_items": [
            {
                "title": "Renew establishment registration for all three US sites",
                "description": None,
                "owner": "L. Chen",
                "status": "Pending",
                "priority": "Medium",
                "due_date": "2024-12-15",
            }
        ],
    },
    {
        "_defect": None,
        "authority": "CDSCO",
        "reference_code": "CDSCO-CT-2024-091",
        "title": "Amendment to New Drugs and Clinical Trials Rules — Local Trial Waiver Criteria",
        "summary": "Expands the list of countries whose clinical data may support a local trial waiver.",
        "status": "In Force",
        "document_type": "Amendment",
        "therapeutic_area": "Clinical Operations",
        "source_url": "https://cdsco.gov.in/example/ct-0091",
        "published_date": "2024-10-04",
        "effective_date": "2024-11-01",
        "action_items": [
            {
                "title": "Reassess India filing strategy for two pipeline assets",
                "description": None,
                "owner": "A. Nair",
                "status": "In Review",
                "priority": "High",
                "due_date": "2024-11-30",
            },
            {
                "title": "Update regional regulatory strategy document",
                "description": None,
                "owner": "A. Nair",
                "status": "Pending",
                "priority": "Low",
                "due_date": "2024-12-20",
            },
        ],
    },
    {
        "_defect": "D5 mojibake in title (accented characters)",
        "authority": "HC",
        "reference_code": "HC-GD-2024-0188",
        "title": "Lignes directrices sur la qualitÃ© des mÃ©dicaments biologiques similaires",
        "summary": "Bilingual guidance on biosimilar quality data requirements.",
        "status": "Active",
        "document_type": "Guidance",
        "therapeutic_area": "Biologics",
        "source_url": "https://www.canada.ca/example/gd-0188",
        "published_date": "2024-06-20",
        "effective_date": "2024-09-01",
        "action_items": [
            {
                "title": "Compare biosimilar dossier against Canadian quality expectations",
                "description": None,
                "owner": "M. Dubois",
                "status": "In Review",
                "priority": "Medium",
                "due_date": "2024-08-15",
            }
        ],
    },
    {
        "_defect": "D2 unparseable date in due_date",
        "authority": "MHRA",
        "reference_code": "MHRA-GN-2024-27",
        "title": "Guidance on Software and Artificial Intelligence as a Medical Device",
        "summary": "Clarifies classification and evidence expectations for AI-driven diagnostic software.",
        "status": "Active",
        "document_type": "Guidance Note",
        "therapeutic_area": "Digital Health",
        "source_url": "https://www.gov.uk/example/gn-2024-27",
        "published_date": "2024-11-08",
        "effective_date": "2025-02-01",
        "action_items": [
            {
                "title": "Classify our clinical decision support tool under revised criteria",
                "description": None,
                "owner": "T. Whitfield",
                "status": "Pending",
                "priority": "High",
                "due_date": "sometime in Q1",
            }
        ],
    },
]
