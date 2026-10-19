import type { AuditFinding, Brief, FunnelStage, GoalStage, ReplanChange, VoiceGuide } from "@startica/db/schema";

/**
 * Fieldnote: the fictional demo product used for screenshots, smoke tests and
 * contributors trying the app (`yarn seed:demo`). Every name, person, company
 * and link here is made up; links use reserved `.example` / `example.com`
 * domains so nothing in the demo points at a real site.
 */

export const DEMO_PRODUCT = {
  name: "Fieldnote",
  url: "https://fieldnote.example",
  oneLiner: "A note-taking app for field researchers.",
  stage: "launched" as const,
  goalLadder: [
    { key: "visitors", label: "Visitors", metric: "sessions", target: 6000 },
    { key: "signups", label: "Signups", metric: "signups", target: 400 },
    { key: "active", label: "Active researchers", metric: "active_users", target: 150 },
    { key: "paid", label: "Paying teams", metric: "active_subscriptions", target: 40 },
  ] satisfies GoalStage[],
  ownerNotes:
    "We're two people. Focus on ecology and social-science grad students first; university lab licenses come later. Don't promise a desktop app yet.",
  brief: {
    summary:
      "Fieldnote is an offline-first notebook for researchers who collect observations away from a desk: ecologists, archaeologists, anthropologists and UX researchers on site visits. Notes carry GPS, time, photos and audio automatically, follow reusable observation templates, and sync to a shared project when the connection comes back.",
    category: "Research productivity",
    audience:
      "Graduate students, field technicians and small research teams who take structured notes outdoors or on site, often without signal, and later need to analyze or share them.",
    problem:
      "Field notes end up split between a paper notebook, a phone's camera roll and a spreadsheet typed up at night. Transcribing takes hours, locations and times get lost, and teammates can't see each other's observations until someone merges them.",
    value_props: [
      "Works fully offline; syncs when you're back in range",
      "Every note is stamped with location, time and weather",
      "Observation templates (transects, interviews, site surveys) keep data consistent across a team",
      "Photos, audio and sketches live next to the note they belong to",
      "Export to CSV, GeoJSON or Markdown for analysis",
    ],
    differentiators: [
      "Built for no-signal sites, not adapted from an office note app",
      "Structured templates and free text in the same note",
      "Shared projects with per-site permissions for labs and field schools",
    ],
    positioning:
      "For field researchers who juggle paper notebooks, photos and spreadsheets, Fieldnote is an offline-first field notebook that captures structured observations with location and media, and syncs them to the team. Unlike general note apps, it's designed for days without signal and data that needs to be analyzed later.",
    pricing_notes: "Free for individuals (3 projects). Team plan $8 per researcher per month; discounts for universities.",
    open_questions: [
      "Should field schools get a free classroom plan?",
      "Is a desktop app needed, or is the web export enough?",
      "Which template library should ship first: ecology or qualitative interviews?",
    ],
  } satisfies Brief,
  relevanceThreshold: 0.7,
  intentThreshold: 0.5,
};

export const DEMO_PERSONAS = [
  {
    name: "Ecology grad student",
    summary: "Runs transects and plot surveys for a thesis, often alone and far from signal.",
    pains: ["Retyping paper notes every evening", "Photos and GPS points that don't match up with notes", "Losing a notebook to rain"],
    goals: ["Clean data ready for R by the end of the season", "Less time transcribing, more time in the field"],
    hangouts: ["r/ecology", "r/GradSchool", "lab Slack groups"],
  },
  {
    name: "Field school instructor",
    summary: "Teaches archaeology or ecology field methods to 10–30 students each summer.",
    pains: ["Every student records differently", "Collecting and grading notebooks is slow", "No view of what was recorded where"],
    goals: ["Consistent records across the class", "See the whole site's notes in one place"],
    hangouts: ["r/Archaeology", "teaching listservs", "conference workshops"],
  },
  {
    name: "UX researcher on site visits",
    summary: "Does contextual inquiry at customer sites and needs quick, tagged notes with photos.",
    pains: ["Notes scattered across a laptop, phone and sticky notes", "Hard to share raw observations with the team quickly"],
    goals: ["Synthesis-ready notes the same day", "Easy sharing with designers and PMs"],
    hangouts: ["r/UXResearch", "research ops communities", "LinkedIn"],
  },
];

export const DEMO_COMPETITORS = [
  {
    name: "TerraJot",
    url: "https://terrajot.example",
    positioning: "GPS field-data collection forms for survey crews.",
    strengths: ["Strong form builder", "Good map view"],
    weaknesses: ["Rigid: no free-text notes", "Priced for agencies, not students"],
  },
  {
    name: "Quadrat",
    url: "https://quadrat.example",
    positioning: "Species-observation logging for citizen science.",
    strengths: ["Large community", "Free"],
    weaknesses: ["Built for single sightings, not research projects", "Weak export options"],
  },
  {
    name: "Logbook Pro",
    url: "https://logbookpro.example",
    positioning: "A general-purpose notes app with a 'field' template pack.",
    strengths: ["Familiar, polished editor", "Cross-platform"],
    weaknesses: ["Needs a connection to sync reliably", "No structured observations"],
  },
];

export const DEMO_KEYWORDS: { keyword: string; intent: "problem" | "solution" | "competitor" | "brand"; useFor: "listening" | "seo" | "both" }[] = [
  { keyword: "field notes app", intent: "solution", useFor: "both" },
  { keyword: "offline note taking", intent: "solution", useFor: "both" },
  { keyword: "digitize field notebook", intent: "problem", useFor: "listening" },
  { keyword: "transect data collection", intent: "problem", useFor: "both" },
  { keyword: "fieldwork tablet", intent: "problem", useFor: "listening" },
  { keyword: "TerraJot alternative", intent: "competitor", useFor: "seo" },
  { keyword: "Fieldnote", intent: "brand", useFor: "listening" },
];

export const DEMO_COMMUNITIES = [
  { channel: "reddit" as const, name: "ecology", why: "Grad students and technicians discussing field methods.", promoRules: "Self-promotion allowed in the weekly thread only.", status: "watching" as const },
  { channel: "reddit" as const, name: "GradSchool", why: "Thesis workflow and tool questions come up weekly.", promoRules: "No advertising; helpful answers that mention a tool are fine.", status: "watching" as const },
  { channel: "reddit" as const, name: "Archaeology", why: "Field school instructors and students.", promoRules: "unknown", status: "suggested" as const },
  { channel: "reddit" as const, name: "UXResearch", why: "Contextual inquiry and site-visit note taking.", promoRules: "Disclose affiliation when recommending tools.", status: "watching" as const },
  { channel: "hackernews" as const, name: "Hacker News", why: "Offline-first and local-first software threads.", promoRules: "Show HN for launches; no marketing in comments.", status: "suggested" as const },
  { channel: "reddit" as const, name: "productivity", why: "Mostly office workflows; rarely about fieldwork.", promoRules: "unknown", status: "ignored" as const },
];

export const DEMO_RESEARCH_DOCS = [
  {
    kind: "product_page" as const,
    url: "https://fieldnote.example/",
    title: "Fieldnote: the field notebook that works without signal",
    content:
      "Description: Offline-first notes for field researchers.\n\nCapture observations with location, time and photos. Use templates for transects, interviews and site surveys. Sync to your team when you're back in range. Export to CSV, GeoJSON or Markdown.",
  },
  {
    kind: "product_page" as const,
    url: "https://fieldnote.example/pricing",
    title: "Pricing · Fieldnote",
    content: "Free for individuals: 3 projects, unlimited notes.\nTeam: $8 per researcher per month, shared projects and permissions.\nUniversities: ask about lab and field-school licenses.",
  },
  {
    kind: "research_notes" as const,
    url: null,
    title: "Market research notes",
    content:
      "Field researchers mostly combine paper notebooks with phone photos and spreadsheets. Survey-crew tools (TerraJot) are form-only and expensive; citizen-science apps (Quadrat) don't model research projects; general note apps (Logbook Pro) assume connectivity. Grad students discuss this in r/ecology and r/GradSchool around the start of each field season (March–May).",
  },
];

/** Conversations and what happened to them. `daysAgo` is when the thread was posted. */
export type DemoOpportunity = {
  key: string;
  channel: "reddit" | "hackernews" | "x" | "linkedin";
  community: string | null;
  author: string;
  title: string;
  body: string;
  daysAgo: number;
  relevance: number | null;
  intent: number | null;
  reasoning: string;
  angle?: string;
  matchedOn: string;
  status: "drafted" | "posted" | "archived" | "dismissed";
  dismissReason?: "off_topic" | "wrong_audience" | "too_old" | "rules_forbid" | "already_answered" | "other";
  duplicateOf?: string;
  drafts?: { body: string; mentionsProduct: boolean; rationale: string }[];
  /** For posted ones: how the reply did. */
  engagement?: { score: number | null; replies: number };
  origin?: "listening" | "manual";
};

export const DEMO_OPPORTUNITIES: DemoOpportunity[] = [
  {
    key: "transect-notes",
    channel: "reddit",
    community: "ecology",
    author: "demo_user_1",
    title: "How do you digitize field notebooks without losing a whole evening?",
    body: "Second field season for my thesis. I do vegetation transects all day, then spend 2–3 hours every night typing my notebook into a spreadsheet and matching photos to plots. There has to be a better way. What do people use?",
    daysAgo: 1,
    relevance: 0.91,
    intent: 0.84,
    reasoning: "A grad student describing the exact problem (transcribing notes, matching photos) and asking for tools.",
    angle: "Share a concrete workflow first; mention Fieldnote as one option with disclosure.",
    matchedOn: "digitize field notebook",
    status: "drafted",
    drafts: [
      {
        body: "I lost a lot of evenings to this too. Two things helped: use one fixed code per plot in both the notebook and the photo filename (P03-T2), and type up only what changed since the template, not the whole page. Full disclosure: I built Fieldnote for this problem, so I'm biased, but it records the plot, GPS and photos with the note while you're out there and exports a CSV you can open in R: https://fieldnote.example/?utm_source=reddit",
        mentionsProduct: true,
        rationale: "The subreddit allows tool mentions in answers; the reply is useful without the product.",
      },
    ],
  },
  {
    key: "field-school",
    channel: "reddit",
    community: "Archaeology",
    author: "demo_user_2",
    title: "Field school instructors: how do you keep student notebooks consistent?",
    body: "I run a 4-week field school with 18 students. Every year the context sheets come back in 18 different formats. Paper forms help a bit but transcription is a nightmare. Any systems that worked for you?",
    daysAgo: 2,
    relevance: 0.86,
    intent: 0.71,
    reasoning: "An instructor persona asking for systems; strong fit for templates and shared projects.",
    matchedOn: "field notes app",
    status: "drafted",
    drafts: [
      {
        body: "What worked best for us was a single printed context sheet with fixed fields, plus a 10-minute end-of-day check where pairs swap notebooks and flag missing fields. It catches most gaps while people still remember.",
        mentionsProduct: false,
        rationale: "Community rules are unknown, so the reply stays product-free.",
      },
      {
        body: "What worked best for us was a single context sheet with fixed fields, plus a 10-minute end-of-day swap where pairs check each other's notebooks. If you want to go digital, look for something that works offline and enforces the same template for everyone; that's what removes the transcription step.",
        mentionsProduct: false,
        rationale: "Regenerated with guidance: \"mention going digital without naming a product\".",
      },
    ],
  },
  {
    key: "ux-site-visits",
    channel: "reddit",
    community: "UXResearch",
    author: "demo_user_3",
    title: "Note-taking setup for on-site contextual inquiry?",
    body: "Starting a round of site visits at warehouses next month. Laptops are awkward on the floor and my phone notes end up a mess. What's your setup for capturing observations + photos and sharing them with the team the same day?",
    daysAgo: 3,
    relevance: 0.78,
    intent: 0.66,
    reasoning: "On-site research with photos and same-day sharing matches the UX researcher persona.",
    matchedOn: "offline note taking",
    status: "drafted",
    drafts: [
      {
        body: "Tablet + a template with three fixed prompts (task, workaround, quote) worked well for me; anything else goes in a free-text field. Photo right after each observation, so the order matches. Disclosure: I make Fieldnote, which does this offline and shares notes to a team project, but the template idea works in any notes app: https://fieldnote.example/?utm_source=reddit",
        mentionsProduct: true,
        rationale: "The community asks for affiliation disclosure, which the draft includes.",
      },
    ],
  },
  {
    key: "offline-first-hn",
    channel: "hackernews",
    community: null,
    author: "demo_hn_1",
    title: "Ask HN: Good offline-first note apps for fieldwork?",
    body: "My partner is a field biologist and spends weeks without signal. Most note apps either need a connection to sync or lose edits on conflicts. Anything built for this?",
    daysAgo: 18,
    relevance: 0.88,
    intent: 0.8,
    reasoning: "Direct request for an offline-first field tool.",
    matchedOn: "offline note taking",
    status: "posted",
    drafts: [
      {
        body: "Disclosure: I work on Fieldnote, which is built for exactly this (field biologists, weeks offline). Notes are stored locally first and merged per field, so two edits to different fields of the same note don't conflict. Happy to answer questions about how the sync works: https://fieldnote.example/?utm_source=hackernews",
        mentionsProduct: true,
        rationale: "HN allows direct answers to Ask HN questions when affiliation is disclosed.",
      },
    ],
    engagement: { score: 14, replies: 5 },
  },
  {
    key: "gradschool-tools",
    channel: "reddit",
    community: "GradSchool",
    author: "demo_user_4",
    title: "What tools made your fieldwork thesis easier?",
    body: "About to start a field-heavy master's. What apps or habits saved you the most time during data collection?",
    daysAgo: 21,
    relevance: 0.74,
    intent: 0.58,
    reasoning: "Open request for tools from the main persona; moderate intent.",
    matchedOn: "fieldwork tablet",
    status: "posted",
    drafts: [
      {
        body: "Biggest time saver for me: deciding the data sheet format before the first day and never changing it mid-season. Second: a waterproof notebook as a backup even if you go digital. Third: back up photos every night, two places.",
        mentionsProduct: false,
        rationale: "No advertising allowed; a product-free answer still builds credibility.",
      },
    ],
    engagement: { score: null, replies: 3 },
  },
  {
    key: "notebook-brand",
    channel: "reddit",
    community: "ecology",
    author: "demo_user_5",
    title: "Best waterproof paper notebook?",
    body: "Mine dissolved in a creek last week. Which brand survives actual rain?",
    daysAgo: 2,
    relevance: 0.42,
    intent: 0.2,
    reasoning: "About paper notebooks specifically; not looking for software.",
    matchedOn: "field notes app",
    status: "archived",
  },
  {
    key: "gis-job",
    channel: "linkedin",
    community: null,
    author: "demo_user_6",
    title: "Hiring: GIS technician (field data collection)",
    body: "We're hiring a GIS technician for a 6-month field data collection contract. Experience with GPS units required.",
    daysAgo: 4,
    relevance: 0.3,
    intent: 0.05,
    reasoning: "A job posting; nobody is asking for help.",
    matchedOn: "transect data collection",
    status: "archived",
    origin: "manual",
  },
  {
    key: "transect-notes-crosspost",
    channel: "reddit",
    community: "GradSchool",
    author: "demo_user_1",
    title: "How do you digitize field notebooks without losing a whole evening?",
    body: "Cross-posting from r/ecology. Second field season for my thesis. I do vegetation transects all day, then spend 2–3 hours every night typing my notebook into a spreadsheet and matching photos to plots. What do people use?",
    daysAgo: 1,
    relevance: null,
    intent: null,
    reasoning: "Near-duplicate of an opportunity from the last 14 days.",
    matchedOn: "digitize field notebook",
    status: "archived",
    duplicateOf: "transect-notes",
  },
  {
    key: "productivity-system",
    channel: "reddit",
    community: "productivity",
    author: "demo_user_7",
    title: "My offline note taking system for deep work",
    body: "Sharing the system I use to stay offline in the mornings: paper notebook, timer, and a weekly review.",
    daysAgo: 3,
    relevance: 0.55,
    intent: 0.1,
    reasoning: "Keyword match, but it's an office productivity post.",
    matchedOn: "offline note taking",
    status: "dismissed",
    dismissReason: "wrong_audience",
  },
  {
    key: "answered-already",
    channel: "reddit",
    community: "ecology",
    author: "demo_user_8",
    title: "Tablet recommendations for field data entry?",
    body: "Looking for a rugged tablet for data entry in wetlands. Budget around $500.",
    daysAgo: 5,
    relevance: 0.72,
    intent: 0.6,
    reasoning: "Hardware question, adjacent to the product.",
    matchedOn: "fieldwork tablet",
    status: "dismissed",
    dismissReason: "already_answered",
  },
];

export const DEMO_VOICE_SOURCES = [
  {
    name: "Field methods blogger",
    platform: "blog" as const,
    handle: null,
    url: "https://example.com/field-methods-blog",
    notes: "Practical, first-person posts about running field seasons.",
    samples: [
      "Day 12 of the season. The rain stopped at noon, which meant three plots instead of five. Here's the thing nobody tells you about transects: the hard part isn't the counting, it's keeping the notebook readable when your hands are cold.",
      "If you only change one habit this season, make it this: write the plot code before you write anything else. Every photo, every note, every sample bag. Future you, at 11 pm with a spreadsheet, will thank you.",
      "I used to think a good field notebook was about the paper. It's about the template. Same fields, same order, every page. Boring is the point.",
      "Quick tip for field school instructors: do a five-minute notebook swap at the end of each day. Students catch each other's gaps while the site is still fresh in their heads.",
    ],
  },
  {
    name: "Research ops newsletter",
    platform: "newsletter" as const,
    handle: null,
    url: "https://example.com/research-ops-letter",
    notes: "Short, friendly newsletter for research teams.",
    samples: [
      "This week: three ways to get raw observations to your team the same day, without a 40-slide readout.",
      "Hot take: most research repositories fail because nobody tags things at capture time. Tag while you're still on site.",
      "A reader asked how we run site visits with a team of four. Short answer: one note-taker per room, one shared template, and a 15-minute debrief in the car park.",
    ],
  },
];

export const DEMO_VOICE_GUIDE: VoiceGuide = {
  summary: "Practical, first-person and calm. Writes like an experienced field researcher giving a colleague a tip, not like a brand.",
  tone: ["Warm but matter-of-fact", "Lightly self-deprecating", "Confident without hype"],
  structure: ["Open with a concrete scene or problem", "One clear tip per paragraph", "End with a takeaway, not a call to action"],
  vocabulary: ["plot", "transect", "season", "template", "on site", "write-up"],
  dos: ["Use specific numbers and times", "Share what went wrong", "Keep sentences short"],
  donts: ["Marketing adjectives", "Emoji", "Exclamation marks in every sentence"],
  example_openers: ["Day 12 of the season.", "Here's the thing nobody tells you about…", "Quick tip for…"],
};

export const DEMO_CONTENT = [
  {
    channel: "reddit" as const,
    format: "post" as const,
    topic: "How we cut field-note transcription from 3 hours to 20 minutes",
    title: "How I cut my nightly field-note transcription from 3 hours to 20 minutes",
    body: "Last season I spent most evenings typing up transect notes. This season I changed three things: a fixed template, plot codes on everything, and capturing on a phone instead of paper. Here's what worked and what didn't…",
    rationale: "Story-led post for r/ecology's weekly thread; product mentioned once at the end with disclosure.",
    status: "posted" as const,
    postedDaysAgo: 17,
    notes: "Good discussion about waterproof phone cases.",
    engagement: { score: null, replies: 12 },
    tracked: true,
  },
  {
    channel: "linkedin" as const,
    format: "post" as const,
    topic: "What field researchers can teach product teams about site visits",
    title: null,
    body: "Ecologists have been doing 'contextual inquiry' for a century; they just call it fieldwork. Three habits product researchers can borrow: a fixed template, tagging at capture time, and a same-day debrief.",
    rationale: "Bridges the ecology and UX research personas.",
    status: "posted" as const,
    postedDaysAgo: 24,
    notes: null,
    engagement: null,
    tracked: true,
  },
  {
    channel: "blog" as const,
    format: "article" as const,
    topic: "A field-season checklist for grad students",
    title: "The field-season checklist I wish I'd had",
    body: "Before you leave: decide your data sheet, test your backup routine, label everything with plot codes. During: five-minute end-of-day review. After: export early, not at the end of the season.",
    rationale: "SEO piece for 'field season checklist'.",
    status: "draft" as const,
    postedDaysAgo: null,
    notes: null,
    engagement: null,
    tracked: true,
  },
  {
    channel: "newsletter" as const,
    format: "newsletter" as const,
    topic: "Monthly update: shared templates",
    title: "Shared templates are here",
    body: "This month: shared templates for teams, a GeoJSON export fix, and a short guide to setting up a field school class.",
    rationale: "Product update in the research-ops voice.",
    status: "draft" as const,
    postedDaysAgo: null,
    notes: null,
    engagement: null,
    tracked: false,
  },
];

export const DEMO_ROADMAP: {
  stage: FunnelStage;
  title: string;
  why: string;
  playbook: string | null;
  successMetric: string;
  nextStep: string;
  priority: number;
  status: "todo" | "doing" | "done" | "dropped";
  result?: string;
  source: "ai" | "owner";
}[] = [
  {
    stage: "acquisition",
    title: "Answer field-season questions in r/ecology and r/GradSchool",
    why: "Field season starts in spring and these threads peak then; replies have been the best source of signups.",
    playbook: "reddit-value-first",
    successMetric: "20 signups from Reddit replies this month",
    nextStep: "Review the 3 drafts waiting in the Inbox",
    priority: 1,
    status: "doing",
    source: "ai",
  },
  {
    stage: "acquisition",
    title: "Publish a field-season checklist for grad students",
    why: "'field season checklist' has steady search volume and no good answer.",
    playbook: "seo-geo",
    successMetric: "300 organic visits in 30 days",
    nextStep: "Finish the draft in Content Studio",
    priority: 2,
    status: "todo",
    source: "ai",
  },
  {
    stage: "activation",
    title: "Start new users from a template, not an empty notebook",
    why: "The onboarding audit found that most new users stall on an empty project.",
    playbook: "onboarding-activation",
    successMetric: "Week-1 activation from 28% to 40%",
    nextStep: "Pick the three starter templates",
    priority: 1,
    status: "todo",
    source: "ai",
  },
  {
    stage: "retention",
    title: "End-of-day summary email during field season",
    why: "Researchers who review notes the same day keep using Fieldnote longer.",
    playbook: "re-engagement-email",
    successMetric: "Week-4 retention +5 points",
    nextStep: "Draft the email copy",
    priority: 3,
    status: "todo",
    source: "owner",
  },
  {
    stage: "revenue",
    title: "Field-school classroom plan",
    why: "Instructors ask for it, and a class converts to team plans later.",
    playbook: "paid-conversion",
    successMetric: "5 paid classrooms by the end of the season",
    nextStep: "Talk to two instructors from the Inbox",
    priority: 2,
    status: "todo",
    source: "ai",
  },
  {
    stage: "referral",
    title: "Invite a labmate from inside a shared project",
    why: "Projects are shared by nature; make inviting the obvious next step.",
    playbook: "referral-loop",
    successMetric: "15% of new signups come from invites",
    nextStep: "Add an invite prompt after the first export",
    priority: 3,
    status: "todo",
    source: "ai",
  },
  {
    stage: "acquisition",
    title: "Rewrite the landing page hero",
    why: "The old hero said 'notes, reimagined' and didn't mention offline or fieldwork.",
    playbook: "landing-conversion",
    successMetric: "Visitor → signup from 2.1% to 3%",
    nextStep: "Done",
    priority: 1,
    status: "done",
    result: "New hero ('The field notebook that works without signal') shipped; signup rate 2.1% → 2.9% over two weeks.",
    source: "ai",
  },
];

export const DEMO_REPLAN: { summary: string; changes: ReplanChange[] } = {
  summary:
    "Reddit replies drove most signups last week, so the community item moves up. The landing page rewrite is done and worked; onboarding is now the biggest drop-off.",
  changes: [
    { title: "Answer field-season questions in r/ecology and r/GradSchool", change: "updated", reason: "Raised to priority 1: best signup source last week." },
    { title: "Start new users from a template, not an empty notebook", change: "added", reason: "Onboarding audit: most new users stall on an empty project." },
    { title: "Rewrite the landing page hero", change: "kept", reason: "Done; result recorded." },
    { title: "Run a paid search test", change: "dropped", reason: "Too early: no conversion data to optimize against yet." },
  ],
};

export const DEMO_AUDIT: { kind: "landing"; summary: string; findings: AuditFinding[] } = {
  kind: "landing",
  summary: "Clear product and audience. The page undersells offline use and has no proof from real researchers.",
  findings: [
    {
      severity: "high",
      title: "No social proof",
      detail: "There are no quotes, logos or numbers from researchers using Fieldnote.",
      fix: "Add two short quotes from beta users (a grad student and an instructor) under the hero.",
    },
    {
      severity: "medium",
      title: "Offline support is below the fold",
      detail: "The main differentiator appears only in the third section.",
      fix: "Mention offline use in the hero subheading.",
    },
    {
      severity: "low",
      title: "Pricing page lacks a student note",
      detail: "Students are the main audience but the free plan isn't framed for them.",
      fix: "Add 'Free for students and individual researchers' to the free tier.",
    },
  ],
};

/** Daily traffic sources for the Analytics page (share of sessions). */
/** The demo's weekly analytics read-out, as the analytics_summary job would write it. */
export const DEMO_ANALYTICS_SUMMARY = {
  headline: "Reddit replies keep bringing the visitors who sign up, while the Hacker News spike mostly bounced.",
  summary:
    "Visits grew on the week before, led by r/fieldwork and the field-kit blog post. The Hacker News thread sent a burst of visits to /blog/offline-field-kit, but few stayed past the first page and almost none signed up. Pricing-page visitors convert best: about one in sixteen starts a signup.",
  wins: [
    "Communities sent the most signups of any channel: replies in r/fieldwork converted at about 4.5% of visits.",
    "The newsletter converted best per visit (about 6%), from a small list.",
    "MRR kept growing, with only one cancellation this week.",
  ],
  concerns: [
    "The Hacker News visits to /blog/offline-field-kit were mostly one-page visits: the post doesn't lead on to the product.",
    "Mobile is a third of visits; check the signup form on a phone.",
  ],
  tryNext: [
    { title: "Add a clear next step to the offline field kit post", why: "It gets the most new visitors from Hacker News and search, but few of them go on to pricing or signup." },
    { title: "Reply in two more r/fieldwork threads this week", why: "Your replies there brought the visitors most likely to sign up." },
    { title: "Link the pricing page from the newsletter", why: "Newsletter readers convert best, and pricing visitors sign up most." },
  ],
};

/** Source / medium, share of visits, key events per visit. */
export const DEMO_SOURCES: [string, number, number][] = [
  ["google / organic", 0.36, 0.03],
  ["(direct) / (none)", 0.2, 0.035],
  ["bing / organic", 0.03, 0.03],
  ["chatgpt.com / ai-assistant", 0.025, 0.05],
  ["perplexity.ai / referral", 0.01, 0.04],
  ["claude.ai / ai-assistant", 0.005, 0.05],
  ["reddit / community", 0.18, 0.045],
  ["news.ycombinator.com / referral", 0.08, 0.01],
  ["linkedin / social", 0.07, 0.015],
  ["newsletter / email", 0.05, 0.06],
];

/** A few logged AI calls so the System page and the spend total look like a used install. */
export const DEMO_AI_RUNS: { queue: string; task: string; model: string; promptVersion: string; input: number; output: number; cacheRead: number; daysAgo: number; latencyMs: number }[] = [
  { queue: "intel_build", task: "research", model: "claude-opus-5-5", promptVersion: "intel-research@2", input: 48_000, output: 6_200, cacheRead: 0, daysAgo: 28, latencyMs: 142_000 },
  { queue: "intel_build", task: "strategy", model: "claude-opus-5-5", promptVersion: "intel-synthesis@4", input: 31_000, output: 7_800, cacheRead: 0, daysAgo: 28, latencyMs: 61_000 },
  { queue: "roadmap_plan", task: "strategy", model: "claude-opus-5-5", promptVersion: "roadmap-plan@3", input: 18_500, output: 4_100, cacheRead: 0, daysAgo: 7, latencyMs: 36_000 },
  { queue: "audit_run", task: "strategy", model: "claude-opus-5-5", promptVersion: "audit@3", input: 22_000, output: 3_000, cacheRead: 0, daysAgo: 9, latencyMs: 53_000 },
  { queue: "voice_profile_build", task: "strategy", model: "claude-opus-5-5", promptVersion: "voice-guide@1", input: 6_400, output: 1_900, cacheRead: 0, daysAgo: 20, latencyMs: 21_000 },
  { queue: "opportunity_score", task: "score", model: "claude-haiku-5-5", promptVersion: "opportunity-score@1", input: 2_300, output: 120, cacheRead: 1_900, daysAgo: 1, latencyMs: 900 },
  { queue: "opportunity_score", task: "score", model: "claude-haiku-5-5", promptVersion: "opportunity-score@1", input: 2_250, output: 110, cacheRead: 1_900, daysAgo: 2, latencyMs: 850 },
  { queue: "opportunity_score", task: "score", model: "claude-haiku-5-5", promptVersion: "opportunity-score@1", input: 2_400, output: 130, cacheRead: 1_900, daysAgo: 3, latencyMs: 940 },
  { queue: "draft_generate", task: "draft", model: "claude-sonnet-5-5", promptVersion: "reply-draft@2", input: 3_800, output: 420, cacheRead: 2_600, daysAgo: 1, latencyMs: 7_400 },
  { queue: "draft_generate", task: "draft", model: "claude-sonnet-5-5", promptVersion: "reply-draft@2", input: 3_700, output: 390, cacheRead: 2_600, daysAgo: 2, latencyMs: 6_900 },
  { queue: "content_generate", task: "draft", model: "claude-sonnet-5-5", promptVersion: "content-write@1", input: 5_200, output: 1_100, cacheRead: 0, daysAgo: 4, latencyMs: 15_000 },
  { queue: "ping", task: "ping", model: "claude-haiku-5-5", promptVersion: "ping@1", input: 40, output: 12, cacheRead: 0, daysAgo: 29, latencyMs: 600 },
];
