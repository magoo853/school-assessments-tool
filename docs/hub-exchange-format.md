# School Assessments Tool → Code Red Hub exchange format (v1)

A versioned JSON package exported by the School Assessments Tool
(Reports & Exports → "Export for Code Red Hub") and imported by the
Code Red Hub (Assessments → "Import from Assessments Tool").

Purpose: an assessor who starts in the standalone tool can move their
work into the Hub later without re-entering anything.

## File

- Name: `sat-hub-export-YYYY-MM-DD.json`
- MIME: `application/json`
- Top-level:

```jsonc
{
  "format": "sat-hub-exchange",   // must match exactly
  "version": 1,                  // importers reject unknown versions
  "exportedAt": "2026-10-11T19:00:00.000Z",
  "exportedBy": "School Assessments Tool",
  "templates": [ ... ],
  "assessments": [ ... ],
  "schedules": [ ... ]
}
```

## templates[]

Template definitions needed to interpret responses (the Hub matches or
creates its own `assessment_templates` rows).

```jsonc
{
  "key": "isc42",                          // stable template key
  "name": "ISC-Aligned Walkthrough",
  "stateCode": "ISC",                      // ISC | FL | LA | GEN | CUSTOM (assessor-built templates)
  "version": "1",
  "domains": [
    { "name": "Perimeter, Fencing & Gates",
      "checkpoints": [ { "key": "1.1", "num": "1.1", "text": "..." } ] }
  ]
}
```

## assessments[]

```jsonc
{
  "clientName": "Riverside Elementary",
  "campus": "Main campus",
  "templateKey": "isc42",
  "assessorNames": ["Jane Doe"],
  "status": "draft" | "in_progress" | "completed",
  "scheduledDate": "2026-09-14" | null,
  "completedDate": "2026-09-15" | null,
  "score": 84.2,              // % of yes/no checkpoints passed (yes / (yes + no); N/A excluded), 1 decimal; null if none answered
  "review": {                 // OPTIONAL (added Cycle 14, still v1 — see below); present only when a review record exists
    "state": "pending" | "approved" | "sent_back",
    "submittedBy": "...", "submittedAt": "2026-09-15T14:00:00.000Z",
    "reviewerName": "...",    // optional; the reviewer asked to review
    "decidedBy": "...", "decidedAt": "...", "comment": "..."  // optional; comment required in-app when sent back
  },
  "summary": "...",           // provenance + assessors + focus notes + a "Review: …" line when a review record exists
  "responses": [
    { "domain": "...", "number": "1.1", "question": "...",
      "answer": "yes" | "no" | "na",
      "risk": "low" | "moderate" | "high" | null,
      "notes": "..." }       // assessor note; photo refs are inline as [Photo ref: ...]
  ],
  "findings": [
    { "domain": "...", "severity": "low" | "medium" | "high",
      "gapText": "...",       // negative gap statement, never criterion wording
      "recommendation": "...", "note": "..." }
  ],
  "equipment": [
    { "name": "...", "detail": "...",
      "priority": "low" | "moderate" | "high",
      "findingRef": "1.4" | null }
  ],
  "reports": [
    { "kind": "aar" | "findings" | "recommendations",
      "title": "...", "markdown": "...", "updatedAt": "..." }
  ]
}
```

Only answered checkpoints are exported (`answer` is never null).

### Review provenance and v1 compatibility (Cycle 14)

The Hub importer (client preview + server action) hard-rejects any
`version !== 1` but reads fields through tolerant helpers and ignores
unknown fields. Therefore the approval record ships as an **optional
field inside version 1** — bumping to version 2 would break every
current Hub install, while the extra field is safely ignored by
today's importer. Two channels carry the provenance:

1. Structured: `assessments[].review` (above) for a future importer.
   The device-local `reviewerId` is deliberately not exported.
2. Human-readable today: a `Review: approved by … / sent back by … /
   pending … Submitted for review by …` line is appended to
   `assessments[].summary`, which the v1 importer stores verbatim —
   so the approval is visible in the Hub even before it learns to
   parse the structured field.

## schedules[]

```jsonc
{
  "clientName": "...", "campus": "...", "date": "2026-10-20",
  "templateKey": "isc42", "assessorName": "...", "focusNotes": "...",
  "status": "scheduled" | "in_progress" | "completed" | "cancelled"
}
```

## Hub import mapping (v1)

| Export | Hub |
|---|---|
| `assessments[].clientName` | matched (case-insensitive) to an existing `schools` row, or a new school is created during import |
| `templateKey` | matched to `assessment_templates` by (name, version); created from `templates[]` when missing |
| assessment | `assessments` row: `draft→scheduled`, `in_progress→in_progress`, `completed→completed` |
| `responses[]` | `assessment_responses` rows; `risk` folds into `comments` as `[Risk: High] …` (Hub has no risk column) |
| `findings[]` | `assessment_findings` rows; severity direct map; `description` = gap text + recommendation |
| `equipment[]` | `equipment` rows with `status='planned'` |
| `reports[]` | markdown files uploaded to the `assessment-docs` bucket + `assessment_documents` rows |
| `schedules[]` | `assessment_requests` rows: `scheduled→scheduled`, `in_progress→scheduled`, `completed→converted`, `cancelled→declined` |

## Out of scope for v1

- Clery Act ASR reports and policy documents (compliance artifacts; the Hub
  has its own Clery builder).
- Assessor directory entries — assessor names travel in the assessment
  `summary` and `assessorNames`; the Hub has no assessor table.
- Deduplication across repeated imports — the importer reports counts and
  the operator is expected to import each export once.
