/**
 * Demo seed data — FICTIONAL ONLY.
 *
 * Every name, school, and university in this file is invented. Nothing here
 * is traceable to a real school, real person, or any training material.
 * Installed via ensureSeed() in DEMO mode only (see components/Shell.tsx).
 * PROD mode never installs this data.
 */
import { db, uid, nowIso } from "./store";
import type {
  Assessment,
  Answer,
  Risk,
  ResponseRow,
  Finding,
  EquipmentItem,
  ReportDoc,
  ReportKind,
  Assessor,
  ScheduleItem,
  ScheduleStatus,
  CleryReport,
  CleryStatRow,
  CleryDisclosure,
  PolicyDoc,
} from "./store";

/** YYYY-MM-DD, offset days from today (keeps the seed date-relative). */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
}

export function installSeed(): void {
  const now = nowIso();

  /* ---------------------------------- assessors ---------------------------------- */

  const mkAssessor = (
    name: string,
    title: string,
    phone: string,
    email: string,
    clearanceDate: string,
    clearanceExpiry: string,
  ): Assessor =>
    db.assessors.upsert({
      id: uid("asr"),
      name,
      title,
      phone,
      email,
      clearanceStatus: "current",
      clearanceDate,
      clearanceExpiry,
      notes: "Demo record — fictional.",
    });

  const aVoss = mkAssessor(
    "Marlena Voss",
    "Lead Assessor",
    "(555) 214-0080",
    "marlena.voss@example.com",
    "2025-06-30",
    "2027-06-30",
  );
  const aCole = mkAssessor(
    "Darius Cole",
    "Security Assessor",
    "(555) 214-0081",
    "darius.cole@example.com",
    "2025-11-06",
    day(26), // expiring soon — demo of the clearance alert
  );
  const aRaman = mkAssessor(
    "Priya Raman",
    "Security Assessor",
    "(555) 214-0082",
    "priya.raman@example.com",
    "2026-02-15",
    "2027-02-15",
  );
  const aBeckett = mkAssessor(
    "Tom Beckett",
    "Field Assessor",
    "(555) 214-0083",
    "tom.beckett@example.com",
    "2026-09-01",
    "2027-09-01",
  );

  /* --------------------------------- assessments --------------------------------- */

  const riverside: Assessment = db.assessments.upsert({
    id: uid("asm"),
    clientName: "Riverside Elementary",
    campus: "Main campus",
    templateId: "isc42",
    status: "completed",
    assessorIds: [aVoss.id, aCole.id],
    leadAssessorId: aVoss.id,
    focusNotes: "Follow-up on findings from the prior walkthrough.",
    createdAt: now,
    completedAt: "2025-09-10T14:00:00.000Z", // ~13 months before Oct 2026 → reassessment overdue
    cover: {
      date: "2025-09-10",
      assessors: "Marlena Voss, Darius Cole",
      escort: "Principal's office",
      weather: "Clear",
    },
  });

  const northview: Assessment = db.assessments.upsert({
    id: uid("asm"),
    clientName: "Northview Middle School",
    campus: "Main campus",
    templateId: "isc42",
    status: "in_progress",
    assessorIds: [aRaman.id],
    leadAssessorId: aRaman.id,
    focusNotes: "First visit — partial walkthrough, Building A only.",
    createdAt: now,
    cover: {
      date: day(0),
      assessors: "Priya Raman",
      escort: "Assistant principal",
      weather: "Overcast",
    },
  });

  const lincoln: Assessment = db.assessments.upsert({
    id: uid("asm"),
    clientName: "Lincoln High School",
    campus: "West campus",
    templateId: "isc42",
    status: "draft",
    assessorIds: [aBeckett.id],
    focusNotes: "Draft — confirm scope with the district office.",
    createdAt: now,
    cover: { date: "", assessors: "", escort: "", weather: "" },
  });

  /* ---------------------------------- responses ---------------------------------- */

  const resp = (
    assessmentId: string,
    checkpointKey: string,
    answer: Answer,
    risk: Risk | null,
    note: string,
  ): ResponseRow =>
    db.responses.upsert({
      id: uid("rsp"),
      assessmentId,
      checkpointKey,
      answer,
      risk,
      note,
      photoRef: "",
    });

  resp(riverside.id, "acc-01", "no", "high", "Side door by the cafeteria was found propped open with a rock.");
  resp(riverside.id, "acc-02", "yes", null, "Main entrance funnels all visitors through the front office.");
  resp(riverside.id, "door-01", "no", "high", "Several rooms in Building C have doors that only lock with a key from the hallway side.");
  resp(riverside.id, "door-02", "no", "high", "Two pedestrian gates along the playground fence were propped open during school hours.");
  resp(riverside.id, "vis-01", "no", "moderate", "Visitor desk unstaffed 2:45–3:15 PM; two visitors walked in unchallenged.");
  resp(riverside.id, "eop-01", "no", "low", "Emergency operations plan is dated 2023 and has not been readopted.");
  resp(riverside.id, "com-01", "yes", null, "Two-way radios issued to all hallway monitors and the front office.");
  resp(riverside.id, "drill-01", "yes", null, "Lockdown drill logged within the last 60 days.");
  resp(riverside.id, "light-01", "yes", null, "Parking lots and walkways meet lighting standard after dusk.");
  resp(riverside.id, "cam-01", "na", null, "No cameras installed — N/A until a system is deployed.");

  resp(northview.id, "acc-01", "yes", null, "All exterior doors locked during the walkthrough.");
  resp(northview.id, "door-01", "yes", null, "Classroom doors in Building A lock from the inside.");
  resp(northview.id, "vis-01", "no", "moderate", "Visitor log is paper-based and not consistently used.");
  resp(northview.id, "com-01", "na", null, "Not assessed yet — Building B scheduled for next visit.");

  /* ---------------------------------- findings ----------------------------------- */

  const mkFinding = (
    assessmentId: string,
    checkpointKey: string,
    gapText: string,
    risk: Risk,
    note: string,
    recommendation: string,
  ): Finding =>
    db.findings.upsert({
      id: uid("fnd"),
      assessmentId,
      checkpointKey,
      gapText,
      risk,
      note,
      recommendation,
    });

  const f1 = mkFinding(
    riverside.id,
    "door-01",
    "Several classroom doors cannot be locked from the inside",
    "high",
    "Building C classrooms lock only with a key from the hallway side.",
    "Retrofit Building C classroom doors with interior-locking hardware so occupants can secure the room without stepping into the hallway.",
  );
  const f2 = mkFinding(
    riverside.id,
    "door-02",
    "Two exterior gates along the playground fence remain propped open during school hours",
    "high",
    "Both pedestrian gates were propped with rocks; no staff monitoring the opening.",
    "Install self-closing gate hardware with panic egress and a policy that gates stay closed during the school day.",
  );
  const f3 = mkFinding(
    riverside.id,
    "vis-01",
    "Visitor check-in desk is unstaffed during afternoon dismissal",
    "moderate",
    "Desk empty 2:45–3:15 PM; visitors walked in unchallenged.",
    "Staff the desk through the end of dismissal or install a visitor kiosk with intercom to the office.",
  );
  const f4 = mkFinding(
    riverside.id,
    "eop-01",
    "Emergency operations plan has not been updated since 2023",
    "low",
    "Plan on file is dated 2023; no annual review on record.",
    "Readopt the EOP with an annual review cycle and distribute updated annexes to building leads.",
  );

  /* ---------------------------------- equipment ---------------------------------- */

  const mkEquipment = (
    assessmentId: string,
    name: string,
    detail: string,
    priority: Risk,
    findingId?: string,
  ): EquipmentItem =>
    db.equipment.upsert({
      id: uid("eqp"),
      assessmentId,
      findingId,
      name,
      detail,
      priority,
    });

  mkEquipment(
    riverside.id,
    "Interior door lock retrofit — Building C classrooms",
    "12 classroom doors need locksets that lock from the inside without a key. Includes hardware, install labor, and master-key coordination.",
    "high",
    f1.id,
  );
  mkEquipment(
    riverside.id,
    "Self-closing gate hardware — playground fence",
    "Two pedestrian gates need self-closing closers with panic egress hardware; magnetic hold-open tied to the fire panel.",
    "high",
    f2.id,
  );
  mkEquipment(
    riverside.id,
    "Visitor management kiosk — front office",
    "Tablet-based check-in with ID scan and badge printing for days the desk cannot be staffed.",
    "moderate",
    f3.id,
  );

  /* ----------------------------------- reports ----------------------------------- */

  const mkReport = (
    assessmentId: string,
    kind: ReportKind,
    title: string,
    markdown: string,
  ): ReportDoc =>
    db.reports.upsert({
      id: uid("rpt"),
      assessmentId,
      kind,
      title,
      markdown,
      updatedAt: now,
    });

  mkReport(
    riverside.id,
    "aar",
    "After-Action Report — Riverside Elementary",
    [
      "# After-Action Report — Riverside Elementary",
      "",
      "## Visit summary",
      "",
      "On-site walkthrough conducted on 2025-09-10 by Marlena Voss and Darius Cole, escorted by the principal's office. Weather was clear. The walkthrough covered the main building, Building C, the playground fence line, and the front office.",
      "",
      "## Key observations",
      "",
      "- Perimeter control is the weakest area: a propped cafeteria side door and two propped playground gates were found during school hours.",
      "- Classroom door hardware in Building C does not allow interior locking.",
      "- Visitor management is inconsistent during afternoon dismissal.",
      "",
      "## Follow-up",
      "",
      "Four findings were documented. A reassessment visit is recommended within 12 months to verify corrective actions.",
    ].join("\n"),
  );

  mkReport(
    riverside.id,
    "findings",
    "Findings Report — Riverside Elementary",
    [
      "# Findings Report — Riverside Elementary",
      "",
      "## High risk",
      "",
      "- **Several classroom doors cannot be locked from the inside** — Building C classrooms lock only with a key from the hallway side.",
      "- **Two exterior gates along the playground fence remain propped open during school hours** — both pedestrian gates were propped with rocks.",
      "",
      "## Moderate risk",
      "",
      "- **Visitor check-in desk is unstaffed during afternoon dismissal** — desk empty 2:45–3:15 PM.",
      "",
      "## Low risk",
      "",
      "- **Emergency operations plan has not been updated since 2023** — no annual review on record.",
    ].join("\n"),
  );

  mkReport(
    riverside.id,
    "recommendations",
    "Recommendations Report — Riverside Elementary",
    [
      "# Recommendations Report — Riverside Elementary",
      "",
      "## Priority 1 — perimeter control",
      "",
      "- Retrofit Building C classroom doors with interior-locking hardware.",
      "- Install self-closing gate hardware with panic egress on both playground gates.",
      "- Adopt a written policy that gates remain closed during the school day.",
      "",
      "## Priority 2 — visitor management",
      "",
      "- Staff the visitor desk through the end of dismissal, or deploy a visitor kiosk with office intercom.",
      "",
      "## Priority 3 — plans and procedures",
      "",
      "- Readopt the emergency operations plan on an annual review cycle.",
    ].join("\n"),
  );

  /* ---------------------------------- schedules ---------------------------------- */

  const mkSchedule = (
    clientName: string,
    campus: string,
    date: string,
    status: ScheduleStatus,
    focusNotes: string,
    assessorId?: string,
    assessmentId?: string,
  ): ScheduleItem =>
    db.schedules.upsert({
      id: uid("sch"),
      clientName,
      campus,
      date,
      templateId: "isc42",
      assessorId,
      focusNotes,
      status,
      assessmentId,
    });

  mkSchedule(
    "Northview Middle School",
    "Main campus",
    day(-2),
    "in_progress",
    "Building A walkthrough underway; Building B next visit.",
    aRaman.id,
    northview.id,
  );
  mkSchedule(
    "Lincoln High School",
    "West campus",
    day(12),
    "scheduled",
    "Awaiting district scope confirmation before the visit.",
    aBeckett.id,
    lincoln.id,
  );
  mkSchedule(
    "Riverside Elementary",
    "Main campus",
    day(34),
    "scheduled",
    "12-month reassessment follow-up — verify corrective actions on prior findings.",
    aVoss.id,
  );
  mkSchedule(
    "Cedar Grove Academy",
    "North campus",
    day(58),
    "scheduled",
    "Initial assessment — full walkthrough.",
    aCole.id,
  );
  mkSchedule(
    "Maplewood Prep",
    "Main campus",
    day(-13),
    "cancelled",
    "Cancelled at the client's request — reschedule in the spring.",
  );

  /* ------------------------------- clery report ---------------------------------- */

  const clery: CleryReport = db.cleryReports.upsert({
    id: uid("clr"),
    institution: "Sample University",
    reportYear: 2026, // ASR covers 2023–2025 per filing rules
    preparerName: "Jordan Ellis",
    preparerTitle: "Clery Compliance Coordinator",
    stats: [],
    disclosures: [],
    createdAt: now,
    updatedAt: now,
  });

  const stat = (
    year: number,
    group: string,
    offense: string,
    geo: string,
    value: number | null,
    confirmedZero = false,
  ): CleryStatRow => ({
    id: uid("cls"),
    reportId: clery.id,
    year,
    group,
    offense,
    geo,
    value,
    confirmedZero,
  });

  const stats: CleryStatRow[] = [
    // 2023 — a few entered, one confirmed zero, rest unentered
    stat(2023, "Criminal offenses", "Burglary", "onCampus", 2),
    stat(2023, "Criminal offenses", "Robbery", "onCampus", null),
    stat(2023, "Criminal offenses", "Motor vehicle theft", "publicProperty", 0, true),
    // 2024
    stat(2024, "Criminal offenses", "Burglary", "onCampus", 1),
    stat(2024, "VAWA", "Stalking", "onCampus", 2),
    stat(2024, "Fire statistics", "Fires", "residential", 1),
    stat(2024, "Hate crimes", "Intimidation", "onCampus", null),
    // 2025
    stat(2025, "Criminal offenses", "Burglary", "onCampus", null),
    stat(2025, "Hazing", "Reported incidents", "onCampus", 1),
    stat(2025, "Arrests & referrals", "Drug law violations", "onCampus", 3),
    stat(2025, "VAWA", "Dating violence", "residential", null),
  ];
  clery.stats = stats;

  const disclosures: CleryDisclosure[] = [
    { key: "crime-stats", label: "Campus crime statistics disclosure", complete: true, note: "Stats entered for 2023–2025." },
    { key: "facility-security", label: "Security of and access to campus facilities", complete: true, note: "Starter text drafted." },
    { key: "law-enforcement", label: "Campus law enforcement authority", complete: true, note: "Starter text drafted." },
    { key: "timely-warning", label: "Timely warning policy", complete: false, note: "Starter text drafted — verify with campus counsel." },
    { key: "emergency-response", label: "Emergency response and evacuation procedures", complete: false, note: "Starter text drafted — verify with campus counsel." },
    { key: "missing-student", label: "Missing student notification policy", complete: false, note: "Starter text drafted — verify with campus counsel.", requiredFromYear: 2010 },
    { key: "drug-alcohol", label: "Drug and alcohol abuse education programs", complete: false, note: "Starter text drafted — verify with campus counsel." },
    { key: "vawa-programs", label: "Sexual assault, domestic violence, dating violence, and stalking programs", complete: false, note: "Starter text drafted — verify with campus counsel." },
    { key: "sex-offender", label: "Registered sex offender information", complete: false, note: "Starter text drafted — verify with campus counsel." },
    { key: "emergency-notification", label: "Emergency notification policy", complete: false, note: "Starter text drafted — verify with campus counsel." },
    { key: "crime-prevention", label: "Crime prevention programs", complete: false, note: "Starter text drafted — verify with campus counsel." },
    { key: "hazing", label: "Hazing policy", complete: false, note: "Starter text drafted — verify with campus counsel.", requiredFromYear: 2024 },
  ];
  clery.disclosures = disclosures;
  db.cleryReports.upsert(clery);

  /* --------------------------------- policy docs --------------------------------- */

  const mkPolicy = (title: string, category: string, body: string): PolicyDoc =>
    db.policyDocs.upsert({
      id: uid("pol"),
      title,
      category,
      body,
      updatedAt: now,
    });

  mkPolicy(
    "Emergency Operations Plan",
    "Emergency planning",
    [
      "# Emergency Operations Plan — starter",
      "",
      "An emergency operations plan (EOP) documents how a school prevents, prepares for, responds to, and recovers from emergencies. This starter gives you the plan's structure; replace every bracketed placeholder with site-specific detail and have the final plan reviewed by local emergency management before adoption.",
      "",
      "Assign a single owner for the EOP — typically the school safety director or an administrator — and readopt the plan at least annually. Distribute the relevant annexes to building leads, the front office, and the school resource officer so the people who execute the plan actually have copies.",
      "",
      "Minimum sections to complete: command and control (who can declare an emergency and who is in charge), communications (how staff, parents, and first responders are notified), lockdown / evacuation / reunification procedures, threat assessment team roles, and a training and exercise calendar. Attach your floor plans, utility shutoffs, and staging locations as appendices.",
      "",
      "Review the plan after every drill and every real incident. A short after-action note attached to the EOP is worth more than a rewritten plan nobody reads.",
    ].join("\n"),
  );

  mkPolicy(
    "Visitor Management",
    "Access control",
    [
      "# Visitor Management — starter",
      "",
      "Every campus visitor should be identified, authorized, and badged before reaching instructional areas. The minimum standard is a staffed check-in point at the single point of entry, government-issued ID verification, and a printed badge showing the visitor's name, destination, and the date.",
      "",
      "The weakest windows are arrival and dismissal, when volume is highest and staffing is thinnest. Write the visitor post order for those windows explicitly — who staffs the desk, what happens when they cannot, and how the office is alerted to a visitor who walks past. An unstaffed desk with an open door is the same as no desk.",
      "",
      "Keep a visitor log that records name, organization, person visited, time in, and time out. Electronic logs with ID scanning are preferable; a paper log that is not consistently used is a liability, not a record.",
      "",
      "Contractors, deliveries, and recurring volunteers follow the same check-in. Nobody is grandfathered in because they are familiar — familiarity is how tailgating works.",
    ].join("\n"),
  );

  mkPolicy(
    "Timely Warning",
    "Clery compliance",
    [
      "# Timely Warning — starter",
      "",
      "The Clery Act requires institutions to issue timely warnings for reported Clery Act crimes that represent a serious or continuing threat to students and employees. This policy starter describes the decision process; it is not legal advice — have campus counsel review it before adoption.",
      "",
      "Designate who decides: a small group (e.g., chief of police, dean of students, Clery compliance officer) evaluates each reported crime against the threat standard and documents the decision, including decisions not to warn. The warning itself is distributed by the fastest reliable channel — text alert, email, and website posting — and includes the nature of the crime, location, date, and safety guidance.",
      "",
      "Timely warnings are distinct from emergency notifications: warnings follow reported crimes and allow more deliberation, while emergency notifications go out immediately on confirmation of a significant emergency or dangerous situation. Do not use the emergency notification channel for every timely warning, or the channel loses its urgency.",
      "",
      "Keep a log of every warning issued and every crime evaluated for a warning, with dates, who decided, and the rationale. Auditors ask for this log.",
    ].join("\n"),
  );

  mkPolicy(
    "Missing Student Notification",
    "Clery compliance",
    [
      "# Missing Student Notification — starter",
      "",
      "For institutions with on-campus student housing, the Clery Act requires a missing student notification policy. Every student residing in on-campus housing must be able to designate a confidential contact who is notified if the student is determined missing for more than 24 hours.",
      "",
      "For students under 18 who are not emancipated, the institution must also notify a custodial parent or guardian in addition to any designated contact — no exceptions, no opt-out. Local law enforcement must be notified within 24 hours of the determination that a student is missing, unless the local agency made the determination.",
      "",
      "Write the intake procedure clearly: who takes a missing-student report, who escalates it, and what the first four hours look like — room check, card-swipe review, contact attempts, and notification of the residence life duty officer. Time stamps matter.",
      "",
      "Store confidential contact information in a system that is accessible only to authorized officials and law enforcement during a missing-person investigation. Do not expose it in routine directories.",
    ].join("\n"),
  );

  mkPolicy(
    "Drug & Alcohol",
    "Student conduct",
    [
      "# Drug & Alcohol — starter",
      "",
      "State plainly what is prohibited: the unlawful possession, use, or distribution of illicit drugs and alcohol on campus and at school-sponsored activities. Reference the applicable federal, state, and local laws, and the health risks associated with use — the Clery Act requires the annual security report to describe the institution's drug and alcohol programs.",
      "",
      "Describe the standards of conduct, the disciplinary sanctions for violations, and the appeal process. Sanctions should be progressive and documented; the most common failure in reviews is a policy that exists but is applied inconsistently.",
      "",
      "List the education and counseling resources available to students and employees — prevention programs, counseling services, and referral contacts with phone numbers. A policy that only punishes and never refers reads as punitive rather than protective.",
      "",
      "Review the program's effectiveness biennially as the Drug-Free Schools regulations require, and keep the review on file. Auditors ask for the biennial review specifically.",
    ].join("\n"),
  );

  mkPolicy(
    "Hazing Policy",
    "Student conduct",
    [
      "# Hazing Policy — starter",
      "",
      "The Stop Campus Hazing Act requires institutions to include a hazing policy in the annual security report, publish a campus hazing transparency report, and report hazing statistics. This starter covers the policy; the transparency report and statistics are separate deliverables.",
      "",
      "Define hazing clearly: any intentional, knowing, or reckless act committed by a person against a student — in connection with initiation into, affiliation with, or continued membership in a student organization — that causes or creates a risk of physical or psychological injury. Include the common defenses that do not apply: consent of the victim and that the conduct was not an official organizational event.",
      "",
      "State the reporting channels (who to tell, how, anonymously if allowed), the investigation process, and the sanctions for individuals and organizations. Describe the prevention and awareness programs the institution provides to students.",
      "",
      "Maintain the campus hazing transparency report with findings of hazing violations by student organizations, updated at least twice per year, and keep it publicly available. Coordinate with student affairs so findings reach the report without delay.",
    ].join("\n"),
  );

  mkPolicy(
    "Daily Crime Log",
    "Clery compliance",
    [
      "# Daily Crime Log — starter",
      "",
      "Campus police or security departments must maintain a daily crime log recording all crimes reported to them, not just Clery Act crimes. The log is a public record: it must be open for inspection during normal business hours and, for entries older than 60 days, made available within two business days of a request.",
      "",
      "Each entry records the nature of the crime, the date and time it was reported, the date and time it occurred, the general location, and the disposition if known. Write entries in plain language a non-officer can understand; the log is read by students, parents, and reporters.",
      "",
      "Entries must be added within two business days of the report. Information may be withheld only where disclosure is prohibited by law, would jeopardize the confidentiality of the victim, or would compromise an ongoing investigation — and the reason for withholding must be documented.",
      "",
      "Audit the log monthly against dispatch records. The most common violation is not malice but drift: reports that never made it from the CAD system into the public log.",
    ].join("\n"),
  );

  mkPolicy(
    "ASR Narrative Shell",
    "Clery compliance",
    [
      "# ASR Narrative Shell — starter",
      "",
      "The annual security report (ASR) is due October 1 each year and must contain three years of crime statistics plus all required policy disclosures under 34 CFR 668.46. This shell is the narrative spine: replace each bracketed section with your institution's actual policy language before compiling the report.",
      "",
      "Required sections, in order: campus law enforcement authority and jurisdiction; procedures for reporting crimes and the daily crime log; security of and access to campus facilities; timely warnings and emergency notifications; emergency response and evacuation procedures; missing student notification; drug and alcohol programs; sexual assault, domestic violence, dating violence, and stalking programs and procedures; registered sex offender information; crime prevention programs; and the hazing policy.",
      "",
      "Statistics tables follow the narratives: criminal offenses, VAWA offenses, hate crimes by bias category, arrests and disciplinary referrals, unfounded crimes, and fire statistics — each broken out by on-campus, on-campus residential, noncampus, and public property geography. Cells with no data must be genuinely zero, never assumed zero.",
      "",
      "Distribute the ASR to all current students and employees by October 1 (email with a link to the report satisfies the requirement), notify prospective students and employees of its availability, and submit the statistics to the Department of Education via the Campus Safety and Security Survey.",
    ].join("\n"),
  );
}
