import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Startica's local database (SQLite, one file in the user's app-data folder).
 * Ported from the Supabase migrations: uuid → text, timestamptz → integer ms,
 * jsonb/text[] → JSON text, numeric → real. Row-level security, auth and
 * workspace membership are gone: the OS user owns the file. `workspace_id`
 * stays on rows so a future multi-workspace or sync version needs no rewrite.
 */

const id = () => text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
const now = () => new Date();
const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now);
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now).$onUpdateFn(now);
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" });
const json = <T>(name: string) => text(name, { mode: "json" }).$type<T>();
const stringList = (name: string) => text(name, { mode: "json" }).$type<string[]>().notNull().$defaultFn(() => []);
const workspaceId = () =>
  text("workspace_id")
    .notNull()
    .references((): AnySQLiteColumn => workspaces.id, { onDelete: "cascade" });
const productId = () =>
  text("product_id")
    .notNull()
    .references((): AnySQLiteColumn => products.id, { onDelete: "cascade" });

export type Source = "ai" | "owner";
const sources = ["ai", "owner"] as const;
/** Where conversations happen (and replies go). The single list: core, prompts and the UI use it. */
export const channels = ["reddit", "hackernews", "x", "linkedin", "facebook", "mastodon", "bluesky", "discourse", "other"] as const;
export type Channel = (typeof channels)[number];

// --- Core -------------------------------------------------------------------------

export const workspaces = sqliteTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** App-level settings (budget, AI provider, …). Secrets live in `secrets`, not here. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: json<unknown>("value"),
  updatedAt: updatedAt(),
});

/** Encrypted with the OS keychain (Electron safeStorage); see secrets.ts. */
export const secrets = sqliteTable("secrets", {
  id: id(),
  name: text("name").notNull().unique(),
  ciphertext: text("ciphertext").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type GoalStage = { key: string; label: string; metric: string; target?: number };
export type Brief = {
  summary: string;
  category: string;
  audience: string;
  problem: string;
  value_props: string[];
  differentiators: string[];
  positioning: string;
  pricing_notes: string;
  open_questions: string[];
};

export const products = sqliteTable(
  "products",
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text("name").notNull(),
    url: text("url"),
    oneLiner: text("one_liner"),
    stage: text("stage", { enum: ["idea", "pre_launch", "launched", "growing"] }).notNull().default("launched"),
    goalLadder: json<GoalStage[]>("goal_ladder").notNull().$defaultFn(() => []),
    ownerNotes: text("owner_notes"),
    brief: json<Brief>("brief"),
    briefSource: text("brief_source", { enum: sources }),
    briefUpdatedAt: timestamp("brief_updated_at"),
    intelStatus: text("intel_status", {
      enum: ["none", "queued", "crawling", "researching", "writing", "ready", "failed"],
    })
      .notNull()
      .default("none"),
    intelError: text("intel_error"),
    intelUpdatedAt: timestamp("intel_updated_at"),
    relevanceThreshold: real("relevance_threshold").notNull().default(0.7),
    intentThreshold: real("intent_threshold").notNull().default(0.5),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_workspace_idx").on(t.workspaceId)],
);

// --- AI and jobs ---------------------------------------------------------------------

export const aiModels = sqliteTable(
  "ai_models",
  {
    id: id(),
    workspaceId: workspaceId(),
    task: text("task").notNull(),
    model: text("model").notNull(),
    effort: text("effort", { enum: ["low", "medium", "high", "xhigh", "max"] }),
    maxTokens: integer("max_tokens").notNull().default(16000),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("ai_models_task_idx").on(t.workspaceId, t.task)],
);

/** The queue (replaces pgmq). One row per pending/running job. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    workspaceId: workspaceId(),
    queue: text("queue").notNull(),
    payload: json<Record<string, unknown>>("payload").notNull(),
    status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: integer("run_after", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    lockedUntil: timestamp("locked_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_ready_idx").on(t.queue, t.status, t.runAfter)],
);

/** History of every attempt, shown on the System page. */
export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    jobId: text("job_id"),
    queue: text("queue").notNull(),
    attempt: integer("attempt").notNull().default(1),
    status: text("status", { enum: ["running", "succeeded", "failed", "cancelled"] }).notNull().default("running"),
    payload: json<Record<string, unknown>>("payload").notNull(),
    result: json<unknown>("result"),
    error: text("error"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    finishedAt: timestamp("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("job_runs_started_idx").on(t.workspaceId, t.startedAt)],
);

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    jobRunId: text("job_run_id").references(() => jobRuns.id, { onDelete: "set null" }),
    task: text("task").notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    status: text("status", { enum: ["ok", "error", "refused", "blocked"] }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_runs_created_idx").on(t.workspaceId, t.createdAt)],
);

// --- Intel ---------------------------------------------------------------------------

export const researchDocs = sqliteTable(
  "research_docs",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    kind: text("kind", { enum: ["product_page", "research_notes"] }).notNull(),
    url: text("url"),
    title: text("title"),
    content: text("content").notNull(),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("research_docs_product_idx").on(t.productId, t.kind)],
);

export const personas = sqliteTable(
  "personas",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    name: text("name").notNull(),
    summary: text("summary").notNull().default(""),
    pains: stringList("pains"),
    goals: stringList("goals"),
    hangouts: stringList("hangouts"),
    source: text("source", { enum: sources }).notNull().default("owner"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("personas_product_idx").on(t.productId)],
);

/**
 * Kinds of link a competitor's person or account can have. Bluesky, Mastodon, Reddit, Hacker News and feeds are read
 * through their public APIs or feeds, LinkedIn and X only through web search, the rest as watched pages.
 */
export const personLinkKinds = ["linkedin", "x", "bluesky", "mastodon", "reddit", "hackernews", "rss", "github", "youtube", "website", "other"] as const;
export type PersonLinkKind = (typeof personLinkKinds)[number];
export type PersonLink = { kind: PersonLinkKind; url: string };

/** A competitor researched in depth (competitor_research). Every list may be empty; unknowns say "unknown". */
export type CompetitorProfile = {
  summary: string;
  audience: string;
  company: { founded: string; size: string; funding: string; location: string };
  pricing: { model: string; plans: { name: string; price: string; notes: string }[] };
  features: string[];
  messaging: string;
  channels: string[];
  recent: { date: string; what: string; url: string }[];
  praise: string[];
  complaints: string[];
  versus: { theyWin: string[]; youWin: string[] };
  /** Official accounts and feeds seen in the research (blog, changelog, social). */
  accounts: PersonLink[];
  /** What changed since the previous profile (empty on the first). */
  changes: string[];
  sources: { url: string; title: string }[];
  model: string;
};

export const competitors = sqliteTable(
  "competitors",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    name: text("name").notNull(),
    url: text("url"),
    positioning: text("positioning").notNull().default(""),
    strengths: stringList("strengths"),
    weaknesses: stringList("weaknesses"),
    source: text("source", { enum: sources }).notNull().default("owner"),
    /** The in-depth profile from `competitor_research` (ARCHITECTURE.md section 3, "Competitor watch"). */
    profile: json<CompetitorProfile>("profile"),
    profileStatus: text("profile_status", { enum: ["working", "ready", "failed"] }),
    profileError: text("profile_error"),
    profiledAt: timestamp("profiled_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("competitors_product_idx").on(t.productId)],
);

export const keywords = sqliteTable(
  "keywords",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    keyword: text("keyword").notNull(),
    intent: text("intent", { enum: ["problem", "solution", "competitor", "brand"] }).notNull().default("problem"),
    useFor: text("use_for", { enum: ["listening", "seo", "both"] }).notNull().default("both"),
    source: text("source", { enum: sources }).notNull().default("owner"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("keywords_product_keyword_idx").on(t.productId, t.keyword)],
);

export const communities = sqliteTable(
  "communities",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    channel: text("channel", { enum: channels }).notNull(),
    name: text("name").notNull(),
    url: text("url"),
    why: text("why").notNull().default(""),
    promoRules: text("promo_rules").notNull().default(""),
    status: text("status", { enum: ["suggested", "watching", "ignored"] }).notNull().default("suggested"),
    source: text("source", { enum: sources }).notNull().default("owner"),
    rulesCheckedAt: timestamp("rules_checked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("communities_unique_idx").on(t.productId, t.channel, t.name)],
);

// --- Distribution ----------------------------------------------------------------------

export const conversations = sqliteTable(
  "conversations",
  {
    id: id(),
    workspaceId: workspaceId(),
    channel: text("channel", { enum: channels }).notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    kind: text("kind", { enum: ["post", "comment"] }).notNull().default("post"),
    community: text("community"),
    author: text("author"),
    title: text("title"),
    threadTitle: text("thread_title"),
    body: text("body").notNull().default(""),
    postedAt: timestamp("posted_at"),
    score: integer("score"),
    numComments: integer("num_comments"),
    // "reply": a reply to the owner's own post, turned into a conversation only when the owner asks for a drafted answer (publication_replies).
    origin: text("origin", { enum: ["listening", "manual", "reply"] }).notNull().default("listening"),
    /** MinHash signature of the title + text, for near-duplicate detection (core/distribution/fingerprint.ts). */
    fingerprint: text("fingerprint"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("conversations_external_idx").on(t.workspaceId, t.channel, t.externalId),
    index("conversations_posted_idx").on(t.workspaceId, t.postedAt),
  ],
);

export const opportunityStatuses = ["new", "archived", "drafting", "drafted", "posted", "dismissed", "failed"] as const;
export const dismissReasons = ["off_topic", "wrong_audience", "too_old", "rules_forbid", "already_answered", "other"] as const;
/** How a conversation's author feels about the topic or product, from scoring (opportunity-score@2). */
export const sentiments = ["positive", "neutral", "negative", "mixed"] as const;
export type Sentiment = (typeof sentiments)[number];
/** Who a conversation names, matched by text (not AI) when it's stored: the product, and Intel competitors by id. */
export type OpportunityMentions = { product: boolean; competitorIds: string[] };

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    matchedOn: text("matched_on"),
    relevance: real("relevance"),
    intent: real("intent"),
    reasoning: text("reasoning"),
    angle: text("angle"),
    status: text("status", { enum: opportunityStatuses }).notNull().default("new"),
    dismissReason: text("dismiss_reason", { enum: dismissReasons }),
    /** Set when scoring archived this as a near-copy of an earlier opportunity (e.g. a cross-post). */
    duplicateOfId: text("duplicate_of_id").references((): AnySQLiteColumn => opportunities.id, { onDelete: "set null" }),
    error: text("error"),
    scoredAt: timestamp("scored_at"),
    /** Listening trends: from scoring; null for rows scored before opportunity-score@2 or not scored. */
    sentiment: text("sentiment", { enum: sentiments }),
    /** Listening trends: the product's listening keywords found in the title and text (null = not computed yet). */
    matchedKeywords: json<string[]>("matched_keywords"),
    /** Share of voice: the product and competitors named in the conversation (null = not computed yet). */
    mentions: json<OpportunityMentions>("mentions"),
    /** Content calendar: when the owner plans to post the drafted reply; reminded once when due. */
    plannedAt: timestamp("planned_at"),
    remindedAt: timestamp("reminded_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("opportunities_unique_idx").on(t.productId, t.conversationId),
    index("opportunities_status_idx").on(t.productId, t.status, t.createdAt),
    index("opportunities_planned_idx").on(t.productId, t.plannedAt),
  ],
);

export const drafts = sqliteTable(
  "drafts",
  {
    id: id(),
    workspaceId: workspaceId(),
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    mentionsProduct: integer("mentions_product", { mode: "boolean" }).notNull().default(false),
    rationale: text("rationale"),
    utmUrl: text("utm_url"),
    source: text("source", { enum: sources }).notNull().default("ai"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("drafts_version_idx").on(t.opportunityId, t.version)],
);

export const publications = sqliteTable(
  "publications",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    opportunityId: text("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    draftId: text("draft_id").references(() => drafts.id, { onDelete: "set null" }),
    channel: text("channel").notNull(),
    community: text("community"),
    url: text("url"),
    externalId: text("external_id"),
    body: text("body").notNull(),
    mentionsProduct: integer("mentions_product", { mode: "boolean" }).notNull().default(false),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("publications_posted_idx").on(t.productId, t.postedAt)],
);

export const engagementSnapshots = sqliteTable(
  "engagement_snapshots",
  {
    id: id(),
    workspaceId: workspaceId(),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    score: integer("score"),
    replies: integer("replies"),
    removed: integer("removed", { mode: "boolean" }).notNull().default(false),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("engagement_publication_idx").on(t.publicationId, t.capturedAt)],
);

// --- Results ---------------------------------------------------------------------------

export const connections = sqliteTable(
  "connections",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    kind: text("kind", { enum: ["ga4", "umami", "stripe", "product_db", "search_console", "bing_webmaster"] }).notNull(),
    config: json<Record<string, unknown>>("config").notNull().$defaultFn(() => ({})),
    secretId: text("secret_id").references(() => secrets.id, { onDelete: "set null" }),
    status: text("status", { enum: ["untested", "ok", "error"] }).notNull().default("untested"),
    lastSyncedAt: timestamp("last_synced_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("connections_kind_idx").on(t.productId, t.kind)],
);

export const metricsSnapshots = sqliteTable(
  "metrics_snapshots",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    day: text("day").notNull(), // YYYY-MM-DD
    source: text("source", { enum: ["ga4", "umami", "stripe", "product_db", "manual"] }).notNull(),
    metric: text("metric").notNull(),
    dimension: text("dimension").notNull().default(""),
    value: real("value").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("metrics_unique_idx").on(t.productId, t.day, t.source, t.metric, t.dimension),
    index("metrics_day_idx").on(t.productId, t.day),
  ],
);

// --- Roadmap and Today (Phase 5) ---------------------------------------------------

export const funnelStages = ["acquisition", "activation", "retention", "revenue", "referral"] as const;
export type FunnelStage = (typeof funnelStages)[number];

/** Growth roadmap. Each item is also the experiment: hypothesis (why) + success metric + result. */
export const roadmapItems = sqliteTable(
  "roadmap_items",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    stage: text("stage", { enum: funnelStages }).notNull(),
    title: text("title").notNull(),
    why: text("why").notNull().default(""),
    playbook: text("playbook"),
    successMetric: text("success_metric").notNull().default(""),
    nextStep: text("next_step").notNull().default(""),
    /** 1 = do first … 5 = someday */
    priority: integer("priority").notNull().default(3),
    status: text("status", { enum: ["todo", "doing", "done", "dropped"] }).notNull().default("todo"),
    result: text("result"),
    source: text("source", { enum: sources }).notNull().default("owner"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("roadmap_product_idx").on(t.productId, t.status, t.priority)],
);

export type ReplanChange = { title: string; change: "added" | "updated" | "dropped" | "kept"; reason: string };

/** Each (re)plan: what changed and why. */
export const roadmapReplans = sqliteTable(
  "roadmap_replans",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    summary: text("summary").notNull(),
    changes: json<ReplanChange[]>("changes").notNull().$defaultFn(() => []),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("replans_product_idx").on(t.productId, t.createdAt)],
);

export type AnalyticsSummaryBody = {
  headline: string;
  summary: string;
  wins: string[];
  concerns: string[];
  tryNext: { title: string; why: string }[];
};

/** The weekly AI read-out of a product's analytics (ARCHITECTURE.md section 8.2), one row per week written. */
export const analyticsSummaries = sqliteTable(
  "analytics_summaries",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    periodStart: text("period_start").notNull(), // YYYY-MM-DD, local days
    periodEnd: text("period_end").notNull(),
    status: text("status", { enum: ["ready", "failed"] }).notNull().default("ready"),
    error: text("error"),
    body: json<AnalyticsSummaryBody | null>("body"),
    model: text("model"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("analytics_summaries_product_idx").on(t.productId, t.createdAt)],
);

/** Today's ranked to-do list, built each day from what's waiting and the roadmap. */
export const dailyMoves = sqliteTable(
  "daily_moves",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    day: text("day").notNull(), // YYYY-MM-DD, local time
    rank: integer("rank").notNull(),
    kind: text("kind", { enum: ["inbox", "roadmap", "intel", "setup", "content", "audit", "ads", "analytics", "calendar", "listening", "replies", "competitors", "custom"] }).notNull(),
    title: text("title").notNull(),
    why: text("why").notNull().default(""),
    href: text("href"),
    refId: text("ref_id"),
    status: text("status", { enum: ["open", "done", "skipped"] }).notNull().default("open"),
    source: text("source", { enum: ["system", "owner"] }).notNull().default("system"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("moves_day_idx").on(t.productId, t.day)],
);

export type AuditFinding = { severity: "high" | "medium" | "low"; title: string; detail: string; fix: string };

export const audits = sqliteTable(
  "audits",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    kind: text("kind", { enum: ["landing", "onboarding", "seo", "geo"] }).notNull(),
    status: text("status", { enum: ["running", "done", "failed"] }).notNull().default("running"),
    summary: text("summary"),
    findings: json<AuditFinding[]>("findings").notNull().$defaultFn(() => []),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("audits_product_idx").on(t.productId, t.kind, t.createdAt)],
);

// --- Voice bank and Content Studio (Phase 4) ------------------------------------------

export const contentChannels = ["reddit", "x", "linkedin", "hackernews", "mastodon", "bluesky", "discourse", "blog", "newsletter", "email", "other"] as const;
/** "campaign": an email sequence (several emails, each with a subject, preview and send day). */
export const contentFormats = ["post", "thread", "comment", "article", "newsletter", "campaign"] as const;

/** Creators or accounts whose writing the audience already likes. */
export const voiceSources = sqliteTable(
  "voice_sources",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    name: text("name").notNull(),
    platform: text("platform", { enum: contentChannels }).notNull(),
    handle: text("handle"),
    url: text("url"),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("voice_sources_product_idx").on(t.productId)],
);

export const voiceSamples = sqliteTable(
  "voice_samples",
  {
    id: id(),
    workspaceId: workspaceId(),
    sourceId: text("source_id")
      .notNull()
      .references(() => voiceSources.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    url: text("url"),
    postedAt: timestamp("posted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("voice_samples_source_idx").on(t.sourceId)],
);

export type VoiceGuide = {
  summary: string;
  tone: string[];
  structure: string[];
  vocabulary: string[];
  dos: string[];
  donts: string[];
  example_openers: string[];
};

/** A style guide distilled from samples, used when writing content. */
export const voiceProfiles = sqliteTable(
  "voice_profiles",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    name: text("name").notNull(),
    sourceIds: json<string[]>("source_ids").notNull().$defaultFn(() => []),
    guide: json<VoiceGuide>("guide"),
    status: text("status", { enum: ["building", "ready", "failed"] }).notNull().default("building"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("voice_profiles_product_idx").on(t.productId)],
);

export const contentPieces = sqliteTable(
  "content_pieces",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    voiceProfileId: text("voice_profile_id").references(() => voiceProfiles.id, { onDelete: "set null" }),
    channel: text("channel", { enum: contentChannels }).notNull(),
    format: text("format", { enum: contentFormats }).notNull().default("post"),
    topic: text("topic").notNull(),
    title: text("title"),
    body: text("body").notNull().default(""),
    rationale: text("rationale"),
    utmUrl: text("utm_url"),
    status: text("status", { enum: ["drafting", "draft", "posted", "failed"] }).notNull().default("drafting"),
    postedUrl: text("posted_url"),
    postedAt: timestamp("posted_at"),
    notes: text("notes"),
    error: text("error"),
    /** Content calendar: when the owner plans to post it; reminded once when due. */
    plannedAt: timestamp("planned_at"),
    remindedAt: timestamp("reminded_at"),
    /** The AI content plan that suggested it, and why it's there. */
    planId: text("plan_id").references((): AnySQLiteColumn => contentPlans.id, { onDelete: "set null" }),
    planWhy: text("plan_why"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("content_product_idx").on(t.productId, t.createdAt), index("content_planned_idx").on(t.productId, t.plannedAt)],
);

/** Engagement on posted Content Studio pieces, captured by engagement_sync (like engagement_snapshots for replies). */
export const contentSnapshots = sqliteTable(
  "content_snapshots",
  {
    id: id(),
    workspaceId: workspaceId(),
    pieceId: text("piece_id")
      .notNull()
      .references(() => contentPieces.id, { onDelete: "cascade" }),
    score: integer("score"),
    replies: integer("replies"),
    removed: integer("removed", { mode: "boolean" }).notNull().default(false),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("content_snapshots_piece_idx").on(t.pieceId, t.capturedAt)],
);

// --- Accessibility (ARCHITECTURE.md section 9) ------------------------------------------------

export const a11yImpacts = ["critical", "serious", "moderate", "minor"] as const;
export type A11yImpact = (typeof a11yImpacts)[number];
export type ImpactCounts = Record<A11yImpact, number>;

export type AiAccess = {
  crawlers: { token: string; operator: string; purpose: "training" | "search" | "user"; allowed: boolean }[];
  llmsTxt: "present" | "invalid" | "missing";
  checkedAt: number;
};

/** An image on a page, for the alt text review (A3). `alt` null: no alt attribute at all. */
export type PageImage = { src: string; alt: string | null; decorative: boolean; link: string | null; nearby: string; width: number; height: number };

/** An AI fix suggestion for an accessibility issue (A3). Copy-only. */
export type A11yAiFix = { explanation: string; html: string; steps: string[]; confidence: "high" | "medium" | "low"; guidance: string | null; model: string; createdAt: string };
/** One task in a fix plan: the issues it covers (by group id) and the change. */
export type A11yFixPlanTask = { title: string; groupIds: string[]; where: string; change: string; html: string };
/** What a fix plan covered, as it was when it was written (the groups can change or go). */
export type A11yFixPlanIssue = {
  id: string;
  ruleId: string;
  help: string;
  impact: string | null;
  criteria: string[];
  level: string | null;
  pagesCount: number;
  occurrencesCount: number;
  selector: string | null;
  url?: string | null;
  helpUrl: string | null;
};
/** A fix plan for several issues at once (A3): one task list for a coding agent, plus a snapshot of the issues. */
export type A11yFixPlan = { summary: string; tasks: A11yFixPlanTask[]; doneWhen: string[]; issues: A11yFixPlanIssue[]; guidance: string | null; model: string; createdAt: string };
/** An AI suggestion for a Needs review item (A3). The owner decides. */
export type A11yAiReview = { suggestion: "pass" | "fail" | "unsure"; reason: string; model: string; createdAt: string };
/** What the owner fills in for the accessibility statement (A4). The statement itself is built from these and the results. */
export type A11yStatementInput = { organization: string; contact: string; target: "wcag22aa" | "wcag21aa" | "wcag22a"; approach: string; limitations: string; updatedAt: string };

/** A content rule the owner sets for a site (A5), checked on every page. */
export type ContentRule = { id: string; name: string; kind: "text_contains" | "text_missing" | "selector_exists" | "selector_missing" | "links_to"; value: string };
/** A page's readability (A5), for English text of 100 words or more. */
export type PageReadability = { grade: number; ease: number; words: number; sentences: number };
/** What the PDF checks found in one document (A5). */
export type DocumentChecks = {
  pages: number;
  tagged: boolean;
  title: string | null;
  showsTitle: boolean;
  lang: string | null;
  hasText: boolean;
  figures: number;
  figuresWithoutAlt: number;
  headings: number;
  bookmarks: number;
  fields: number;
  unlabeledFields: number;
};

/** A plain-language summary of a site's accessibility progress (A3). */
export type A11ySummary = { text: string; scanId: string | null; model: string; createdAt: string };

export type PageSeo = {
  description: string | null;
  canonical: string | null;
  robots: string | null;
  xRobotsTag: string | null;
  h1: string[];
  ogTitle: string | null;
  ogImage: string | null;
  /** Schema.org types found in valid JSON-LD blocks. */
  structuredTypes: string[];
  wordCount: number;
};

/** What the Security site probes saw on the latest full scan (ARCHITECTURE.md section 11.2). */
export type SiteSecurity = {
  checkedAt: number;
  https: boolean;
  tls: { protocol: string | null; authorized: boolean; error: string | null; validTo: number | null; issuer: string | null } | null;
  httpRedirect: "redirects" | "no-redirect" | "unreachable" | null;
  securityTxt: { status: "missing" | "invalid" | "present"; contact: string[]; expires: string | null; problems: string[] } | null;
  email: { domain: string; spf: string | null; dmarc: string | null; dmarcPolicy: string | null } | null;
};

export const securityVerifyMethods = ["dns", "file", "search_console", "local", "demo"] as const;

/** A website the Accessibility module checks. Belongs to a product (usually its own site). */
export const sites = sqliteTable(
  "sites",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    name: text("name").notNull(),
    startUrl: text("start_url").notNull(),
    include: stringList("include"),
    exclude: stringList("exclude"),
    maxPages: integer("max_pages").notNull().default(250),
    maxDepth: integer("max_depth").notNull().default(6),
    respectRobots: integer("respect_robots", { mode: "boolean" }).notNull().default(true),
    includeAaa: integer("include_aaa", { mode: "boolean" }).notNull().default(false),
    includeBestPractice: integer("include_best_practice", { mode: "boolean" }).notNull().default(false),
    scanIntervalDays: integer("scan_interval_days").notNull().default(7),
    targetScore: integer("target_score").notNull().default(90),
    ownershipConfirmedAt: timestamp("ownership_confirmed_at").notNull(),
    lastScanId: text("last_scan_id"),
    score: real("score"),
    /** SEO & GEO site health score (section 10.3). */
    seoScore: real("seo_score"),
    /** From the latest scan: which AI crawlers robots.txt lets in, and the llms.txt status. */
    aiAccess: json<AiAccess>("ai_access"),
    /** Security (section 11): the ownership token, when and how ownership was proven, the score and what the site probes saw. */
    securityToken: text("security_token"),
    securityVerifiedAt: timestamp("security_verified_at"),
    securityVerifiedBy: text("security_verified_by", { enum: securityVerifyMethods }),
    securityScore: real("security_score"),
    securityCheckedAt: timestamp("security_checked_at"),
    security: json<SiteSecurity>("security"),
    /** A3: the latest plain-language accessibility summary and its state. */
    /** S2: when exposure monitoring last ran and what failed. */
    securityMonitor: json<{ checkedAt: number; errors: string[] }>("security_monitor"),
    a11ySummary: json<A11ySummary>("a11y_summary"),
    a11ySummaryStatus: text("a11y_summary_status", { enum: ["working", "ready", "failed"] }),
    a11ySummaryError: text("a11y_summary_error"),
    /** A4: the details for the accessibility statement. */
    a11yStatement: json<A11yStatementInput>("a11y_statement"),
    /** A5: content quality settings: the owner's rules, words spelling ignores, the readability target grade, when links and documents were last checked. */
    contentRules: json<ContentRule[]>("content_rules"),
    // A SQL default, so existing rows get it.
    spellingIgnore: text("spelling_ignore", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    readabilityTarget: integer("readability_target").notNull().default(9),
    contentCheckedAt: timestamp("content_checked_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sites_product_idx").on(t.productId)],
);

/** One run over a site: a full scan, one page, or the pages of one issue group. One row per run is the history. */
export const siteScans = sqliteTable(
  "site_scans",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    scope: text("scope", { enum: ["full", "page", "group"] }).notNull().default("full"),
    trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull().default("manual"),
    status: text("status", { enum: ["queued", "running", "done", "failed", "cancelled"] }).notNull().default("queued"),
    pagesDone: integer("pages_done").notNull().default(0),
    pagesFailed: integer("pages_failed").notNull().default(0),
    axeVersion: text("axe_version"),
    score: real("score"),
    seoScore: real("seo_score"),
    securityScore: real("security_score"),
    impacts: json<ImpactCounts>("impacts"),
    needsReview: integer("needs_review"),
    newIssues: integer("new_issues"),
    fixedIssues: integer("fixed_issues"),
    error: text("error"),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("site_scans_site_idx").on(t.siteId, t.createdAt)],
);

/** A page found on a site, with its latest results. `state` and `scan_id` track it within the running scan. */
export const sitePages = sqliteTable(
  "site_pages",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title"),
    lang: text("lang"),
    httpStatus: integer("http_status"),
    depth: integer("depth").notNull().default(0),
    scanId: text("scan_id"),
    state: text("state", { enum: ["queued", "done", "failed", "skipped"] }).notNull().default("queued"),
    score: real("score"),
    impacts: json<ImpactCounts>("impacts"),
    needsReview: integer("needs_review").notNull().default(0),
    /** Listed in the site's sitemap (an orphan if nothing links to it). */
    inSitemap: integer("in_sitemap", { mode: "boolean" }).notNull().default(false),
    /** Same-site pages this page links to (normalized), for broken links and orphans. A SQL default, so existing rows get it. */
    links: text("links", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    /** Search facts from the latest check (title is its own column). */
    seo: json<PageSeo>("seo"),
    seoScore: real("seo_score"),
    /** The latest screenshot (A2), a file under <data>/a11y/<site id>/, taken only when the page had issues. */
    screenshot: text("screenshot"),
    screenshotSize: json<{ width: number; height: number }>("screenshot_size"),
    /** The page's images from its latest check (A3 alt text review), at most 100. */
    images: json<PageImage[]>("images"),
    /** A5: the page's readability, when its text is long enough and in English. */
    readability: json<PageReadability>("readability"),
    error: text("error"),
    lastScannedAt: timestamp("last_scanned_at"),
    goneAt: timestamp("gone_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("site_pages_url_idx").on(t.siteId, t.url), index("site_pages_scan_idx").on(t.scanId, t.state)],
);

/** The same rule failing on the same element markup across a site's pages (often one template): what gets fixed. */
export const a11yIssueGroups = sqliteTable(
  "a11y_issue_groups",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["violation", "needs_review"] }).notNull().default("violation"),
    ruleId: text("rule_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    impact: text("impact", { enum: a11yImpacts }),
    help: text("help").notNull(),
    description: text("description").notNull().default(""),
    helpUrl: text("help_url"),
    tags: stringList("tags"),
    criteria: stringList("criteria"),
    level: text("level"),
    sampleSelector: text("sample_selector"),
    sampleHtml: text("sample_html"),
    pagesCount: integer("pages_count").notNull().default(0),
    occurrencesCount: integer("occurrences_count").notNull().default(0),
    status: text("status", { enum: ["open", "fixed", "ignored"] }).notNull().default("open"),
    /** Why it's ignored (A2): false_positive, wont_fix or not_applicable, with the owner's note. */
    ignoreReason: text("ignore_reason"),
    ignoreNote: text("ignore_note"),
    ignoredAt: timestamp("ignored_at"),
    /** Needs review (A2): the owner's decision on a check axe couldn't decide, remembered by fingerprint. */
    reviewStatus: text("review_status", { enum: ["pass", "fail", "skip"] }),
    reviewNote: text("review_note"),
    reviewedAt: timestamp("reviewed_at"),
    /** A3: the AI fix suggestion and the AI's suggestion for a Needs review item, each with its state. */
    aiFix: json<A11yAiFix>("ai_fix"),
    aiFixStatus: text("ai_fix_status", { enum: ["working", "ready", "failed"] }),
    aiFixError: text("ai_fix_error"),
    aiReview: json<A11yAiReview>("ai_review"),
    aiReviewStatus: text("ai_review_status", { enum: ["working", "ready", "failed"] }),
    aiReviewError: text("ai_review_error"),
    firstSeenScanId: text("first_seen_scan_id"),
    firstSeenAt: timestamp("first_seen_at"),
    lastSeenAt: timestamp("last_seen_at"),
    fixedAt: timestamp("fixed_at"),
    fixedScanId: text("fixed_scan_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("a11y_groups_fingerprint_idx").on(t.siteId, t.fingerprint), index("a11y_groups_status_idx").on(t.siteId, t.status)],
);

/** One element failing (or needing review for) one rule on one page, from the page's latest check. */
export const a11yOccurrences = sqliteTable(
  "a11y_occurrences",
  {
    id: id(),
    workspaceId: workspaceId(),
    pageId: text("page_id")
      .notNull()
      .references(() => sitePages.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => a11yIssueGroups.id, { onDelete: "cascade" }),
    selector: text("selector").notNull(),
    html: text("html").notNull().default(""),
    failureSummary: text("failure_summary"),
    impact: text("impact", { enum: a11yImpacts }),
    /** Where the element was on the page (CSS pixels from the top left of the document), for highlights (A2). */
    box: json<{ x: number; y: number; width: number; height: number }>("box"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("a11y_occurrences_page_idx").on(t.pageId), index("a11y_occurrences_group_idx").on(t.groupId)],
);

/**
 * The manual WCAG checklist (A4): the owner's result for one success criterion on a site,
 * with a note, and an optional remark for the ACR/VPAT-style draft.
 */
export const a11yCriteriaReviews = sqliteTable(
  "a11y_criteria_reviews",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** A WCAG success criterion, e.g. "1.4.3". */
    criterion: text("criterion").notNull(),
    status: text("status", { enum: ["pass", "fail", "not_applicable", "not_tested"] }).notNull().default("not_tested"),
    note: text("note"),
    /** The owner's own remark for the conformance report draft (replaces the generated one). */
    remark: text("remark"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("a11y_criteria_reviews_idx").on(t.siteId, t.criterion)],
);

/**
 * Content quality findings on one page (A5): misspelled words, readability above the
 * target, the owner's content rules. Replaced each time the page is checked.
 */
export const siteFindings = sqliteTable(
  "site_findings",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => sitePages.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["spelling", "readability", "rule"] }).notNull(),
    /** The word, "readability", or the rule's id. */
    key: text("key").notNull(),
    detail: json<Record<string, unknown>>("detail").notNull().$defaultFn(() => ({})),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("site_findings_site_idx").on(t.siteId, t.kind), index("site_findings_page_idx").on(t.pageId)],
);

/** A PDF linked from a site (A5), with what the document checks found. */
export const siteDocuments = sqliteTable(
  "site_documents",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    status: text("status", { enum: ["ok", "failed"] }).notNull(),
    httpStatus: integer("http_status"),
    bytes: integer("bytes"),
    checks: json<DocumentChecks>("checks"),
    /** Rule ids from a11y/documents.ts that failed. */
    problems: stringList("problems"),
    linkedFrom: stringList("linked_from"),
    error: text("error"),
    checkedAt: timestamp("checked_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("site_documents_url_idx").on(t.siteId, t.url)],
);

/** An external link found on a site and the result of checking it (A5): kept a week as a cache. */
export const siteLinks = sqliteTable(
  "site_links",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    httpStatus: integer("http_status"),
    error: text("error"),
    linkedFrom: stringList("linked_from"),
    checkedAt: timestamp("checked_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("site_links_url_idx").on(t.siteId, t.url)],
);

/**
 * The alt text review (A3): one row per image address on a site (a logo on every page is
 * one row), with the AI's verdict and a suggested alt. The owner copies what they want.
 */
export const a11yImages = sqliteTable(
  "a11y_images",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    src: text("src").notNull(),
    /** The alt text as found (null: no alt attribute). */
    alt: text("alt"),
    decorative: integer("decorative", { mode: "boolean" }).notNull().default(false),
    pagesCount: integer("pages_count").notNull().default(0),
    samplePage: text("sample_page"),
    verdict: text("verdict", { enum: ["good", "needs_better", "decorative", "missing", "skipped"] }),
    /** The alt text the verdict was given for: a changed alt needs a new one. */
    judgedAlt: text("judged_alt"),
    suggestedAlt: text("suggested_alt"),
    reason: text("reason"),
    model: text("model"),
    status: text("status", { enum: ["new", "working", "ready", "failed"] }).notNull().default("new"),
    error: text("error"),
    reviewedAt: timestamp("reviewed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("a11y_images_src_idx").on(t.siteId, t.src)],
);

/** A fix plan (A3): one AI-written plan for issues the owner picked on the Issues list. */
export const a11yFixPlans = sqliteTable(
  "a11y_fix_plans",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    groupIds: stringList("group_ids"),
    guidance: text("guidance"),
    status: text("status", { enum: ["working", "ready", "failed"] }).notNull().default("working"),
    error: text("error"),
    plan: json<A11yFixPlan>("plan"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("a11y_fix_plans_site_idx").on(t.siteId, t.createdAt)],
);

/**
 * SEO & GEO site health findings (ARCHITECTURE.md section 10.2): one row per rule × page, or per
 * rule for the whole site (page null). `groupKey` groups rows that are one problem
 * (e.g. every page sharing one duplicate title). Replaced on each check.
 */
export const seoFindings = sqliteTable(
  "seo_findings",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => sitePages.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    severity: text("severity", { enum: ["high", "medium", "low", "info"] }).notNull(),
    groupKey: text("group_key").notNull(),
    detail: json<Record<string, unknown>>("detail").notNull().$defaultFn(() => ({})),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("seo_findings_site_idx").on(t.siteId, t.rule), index("seo_findings_page_idx").on(t.pageId)],
);

// --- Security (ARCHITECTURE.md section 11) -------------------------------------------------------

export const securitySeverities = ["critical", "high", "medium", "low", "info"] as const;
export const securityStatuses = ["open", "fixed", "accepted", "false_positive"] as const;
export const aiDraftStatuses = ["working", "ready", "failed"] as const;

/** An AI explanation and fix steps for a finding (S4), for the stack Startica saw. Copy-only. */
export type SecurityAiHelp = {
  summary: string;
  steps: string[];
  snippets: { label: string; language: string; code: string }[];
  verify: string;
  model: string;
  createdAt: string;
};

/** What the AI made of a problem someone reported (S4). The owner decides what to do. */
export type SecurityReportTriage = {
  severity: "critical" | "high" | "medium" | "low" | "info";
  summary: string;
  likelyValid: "likely" | "unclear" | "unlikely";
  duplicateOf: string | null;
  missingInfo: string[];
  reply: string;
  model: string;
  createdAt: string;
};

/**
 * One security problem seen on one page, or site-wide (page null). Replaced each time
 * the page is checked; site-wide rows each time the site probes run. `groupKey` is the
 * finding it belongs to.
 */
export const securityOccurrences = sqliteTable(
  "security_occurrences",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id").references(() => sitePages.id, { onDelete: "cascade" }),
    rule: text("rule").notNull(),
    groupKey: text("group_key").notNull(),
    detail: json<Record<string, unknown>>("detail").notNull().$defaultFn(() => ({})),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("security_occurrences_site_idx").on(t.siteId, t.groupKey), index("security_occurrences_page_idx").on(t.pageId)],
);

/** One fixable security problem on a site, with a lifecycle that survives scans (open, fixed, accepted risk, false positive). */
export const securityFindings = sqliteTable(
  "security_findings",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    groupKey: text("group_key").notNull(),
    /** A SECURITY_RULES id, or "imported" for a finding read from another report (S4). */
    rule: text("rule").notNull(),
    severity: text("severity", { enum: securitySeverities }).notNull(),
    status: text("status", { enum: securityStatuses }).notNull().default("open"),
    /** scan: found by Startica's checks (its lifecycle follows the scans). import / report: added from a vendor's report or a reported problem; only the owner changes its state. */
    source: text("source", { enum: ["scan", "import", "report", "monitor"] }).notNull().default("scan"),
    /** Imported findings carry their own words (rules supply them for scan findings). */
    title: text("title"),
    description: text("description"),
    fix: text("fix"),
    /** Where an imported finding came from ("Pentest report, March 2026"). */
    sourceLabel: text("source_label"),
    aiHelp: json<SecurityAiHelp>("ai_help"),
    aiStatus: text("ai_status", { enum: aiDraftStatuses }),
    aiError: text("ai_error"),
    /** Why the risk is accepted, or why it isn't a real problem. */
    reason: text("reason"),
    decidedAt: timestamp("decided_at"),
    pagesCount: integer("pages_count").notNull().default(0),
    /** What the first occurrence showed (cookie name, script host, header value…). */
    detail: json<Record<string, unknown>>("detail").notNull().$defaultFn(() => ({})),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    firstSeenScanId: text("first_seen_scan_id"),
    fixedAt: timestamp("fixed_at"),
    fixedScanId: text("fixed_scan_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("security_findings_key_idx").on(t.siteId, t.groupKey)],
);

/** A client-side library a page loads, with its version (S2): replaced each time the page is checked. */
export const securityComponents = sqliteTable(
  "security_components",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    pageId: text("page_id")
      .notNull()
      .references(() => sitePages.id, { onDelete: "cascade" }),
    /** The npm package name (OSV's ecosystem for client-side libraries). */
    name: text("name").notNull(),
    version: text("version").notNull(),
    via: text("via", { enum: ["global", "url"] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("security_components_site_idx").on(t.siteId, t.name, t.version), index("security_components_page_idx").on(t.pageId)],
);

/**
 * What exposure monitoring found around a site (S2): subdomains and certificates from
 * certificate transparency logs, look-alike domains that resolve, and third-party scripts
 * with their content hash. One row per kind × name, with when it was first and last seen.
 */
export const securityAssets = sqliteTable(
  "security_assets",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["subdomain", "certificate", "lookalike", "script"] }).notNull(),
    name: text("name").notNull(),
    detail: json<Record<string, unknown>>("detail").notNull().$defaultFn(() => ({})),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    /** When something about it last changed (a script's hash, a subdomain's DNS). */
    changedAt: timestamp("changed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("security_assets_name_idx").on(t.siteId, t.kind, t.name)],
);

/** A problem someone reported to the owner (pasted from email or a form), with AI triage (S4). */
export const securityReports = sqliteTable(
  "security_reports",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    /** Who sent it, as pasted (a name or address). */
    reporter: text("reporter").notNull().default(""),
    body: text("body").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    status: text("status", { enum: ["new", "resolved", "dismissed"] }).notNull().default("new"),
    triage: json<SecurityReportTriage>("triage"),
    triageStatus: text("triage_status", { enum: aiDraftStatuses }),
    triageError: text("triage_error"),
    /** The finding it became, if the owner made one. */
    findingId: text("finding_id").references(() => securityFindings.id, { onDelete: "set null" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("security_reports_product_idx").on(t.productId, t.status)],
);

// --- Issue trackers (GitHub / GitLab) ---------------------------------------------------

/**
 * A product's code repository on GitHub or GitLab, where Startica opens issues for
 * what its checks find (accessibility now, SEO later). The token is in `secrets`.
 */
export const issueTrackers = sqliteTable(
  "issue_trackers",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    provider: text("provider", { enum: ["github", "gitlab"] }).notNull(),
    /** API base: https://api.github.com, a GitHub Enterprise …/api/v3, https://gitlab.com or a self-hosted GitLab. */
    baseUrl: text("base_url").notNull(),
    /** owner/name on GitHub; the project path (group/subgroup/name) on GitLab. */
    repo: text("repo").notNull(),
    secretId: text("secret_id"),
    labels: stringList("labels"),
    /** Open issues automatically for new findings at or above this impact (null: only by hand). */
    autoMinImpact: text("auto_min_impact", { enum: a11yImpacts }),
    /** Open issues automatically for security findings at or above this severity (S2; null: only by hand). */
    autoMinSecurity: text("auto_min_security", { enum: ["critical", "high", "medium", "low"] }),
    /** Comment and close the repo issue when Startica sees the problem fixed (and reopen it if it comes back). */
    closeWhenFixed: integer("close_when_fixed", { mode: "boolean" }).notNull().default(true),
    status: text("status", { enum: ["untested", "ok", "error"] }).notNull().default("untested"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("issue_trackers_product_idx").on(t.productId)],
);

/** One repo issue Startica opened, for one finding (an accessibility issue group or a security finding). */
export const trackerIssues = sqliteTable(
  "tracker_issues",
  {
    id: id(),
    workspaceId: workspaceId(),
    trackerId: text("tracker_id")
      .notNull()
      .references(() => issueTrackers.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind", { enum: ["a11y", "security"] }).notNull().default("a11y"),
    sourceId: text("source_id").notNull(),
    /** The issue number (GitHub) or iid (GitLab). */
    number: integer("number").notNull(),
    url: text("url").notNull(),
    state: text("state", { enum: ["open", "closed"] }).notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tracker_issues_source_idx").on(t.trackerId, t.sourceKind, t.sourceId)],
);

// --- Ads (ARCHITECTURE.md section 8.6) --------------------------------------------------------------

export const adPlatforms = ["google", "meta", "reddit"] as const;
export type AdPlatform = (typeof adPlatforms)[number];

/** Who a group of ads is shown to: keywords for Google, communities for Reddit, audiences for Meta. */
export type AdTargeting = {
  keywords?: { text: string; match: "broad" | "phrase" | "exact" }[];
  negativeKeywords?: string[];
  communities?: string[];
  interests?: string[];
  audience?: string;
  placements?: string[];
  locations?: string[];
};

/** The copy of one ad: which fields exist depends on the platform (see core/ads/platforms.ts). */
export type AdCopy = {
  headlines?: string[];
  descriptions?: string[];
  path1?: string;
  path2?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  title?: string;
  body?: string;
  callToAction?: string;
};

/** A campaign Startica planned for one platform. The user launches it in the platform's ad manager. */
export const adCampaigns = sqliteTable(
  "ad_campaigns",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    platform: text("platform", { enum: adPlatforms }).notNull(),
    name: text("name").notNull(),
    goal: text("goal").notNull(),
    landingUrl: text("landing_url").notNull(),
    monthlyBudget: real("monthly_budget").notNull().default(300),
    /** The test: how much to spend over how many days, and what result counts as working. */
    testBudget: real("test_budget"),
    testDays: integer("test_days"),
    successMetric: text("success_metric"),
    bidStrategy: text("bid_strategy"),
    summary: text("summary"),
    status: text("status", { enum: ["planning", "draft", "failed", "handed_off", "running", "ended"] }).notNull().default("planning"),
    error: text("error"),
    utmCampaign: text("utm_campaign").notNull(),
    notes: text("notes"),
    /** AD4: what one result (the success metric) may cost; below it an ad is worth scaling. */
    targetCost: real("target_cost"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ad_campaigns_product_idx").on(t.productId, t.createdAt)],
);

export const adGroups = sqliteTable(
  "ad_groups",
  {
    id: id(),
    workspaceId: workspaceId(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => adCampaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    angle: text("angle"),
    targeting: json<AdTargeting>("targeting").notNull().default(sql`'{}'`),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ad_groups_campaign_idx").on(t.campaignId)],
);

export const ads = sqliteTable(
  "ads",
  {
    id: id(),
    workspaceId: workspaceId(),
    groupId: text("group_id")
      .notNull()
      .references(() => adGroups.id, { onDelete: "cascade" }),
    copy: json<AdCopy>("copy").notNull().default(sql`'{}'`),
    source: text("source", { enum: sources }).notNull().default("ai"),
    status: text("status", { enum: ["ready", "rewriting", "failed"] }).notNull().default("ready"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ads_group_idx").on(t.groupId)],
);

export const adCreativeSizes = ["1:1", "4:5", "9:16", "1.91:1"] as const;
export type AdCreativeSize = (typeof adCreativeSizes)[number];
export const adTemplates = ["overlay", "panel", "frame"] as const;
export type AdTemplate = (typeof adTemplates)[number];
/** The words a template lays over the picture (AD2). */
export type AdCreativeText = { headline: string; subline?: string; cta?: string; price?: string };
export type AdCreativeColors = { background: string; text: string; accent: string };
/** `fit`: set when the words had to shrink a lot ("small") or still don't fit ("overflow") at this size. */
export type AdRender = { size: AdCreativeSize; width: number; height: number; file: string; bytes: number; fit?: "small" | "overflow" };

/**
 * An ad image (ARCHITECTURE.md section 8.6, AD2): a picture (drawn by the AI, uploaded, or none)
 * with a template's words over it, rendered in every size the platform takes. Files live
 * under <data>/ads/creatives/<id>/; the prompt is kept with the creative.
 */
export const adCreatives = sqliteTable(
  "ad_creatives",
  {
    id: id(),
    workspaceId: workspaceId(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => adCampaigns.id, { onDelete: "cascade" }),
    adId: text("ad_id").references(() => ads.id, { onDelete: "set null" }),
    /** What the picture shows, in the founder's (or the AI's) words. */
    concept: text("concept").notNull().default(""),
    /** The exact prompt sent to the image model. */
    prompt: text("prompt"),
    imageSource: text("image_source", { enum: ["ai", "upload", "none"] }).notNull().default("ai"),
    imageFile: text("image_file"),
    template: text("template", { enum: adTemplates }).notNull().default("overlay"),
    text: json<AdCreativeText>("text").notNull().default(sql`'{"headline":""}'`),
    colors: json<AdCreativeColors>("colors").notNull().default(sql`'{"background":"#111827","text":"#ffffff","accent":"#f59e0b"}'`),
    useLogo: integer("use_logo", { mode: "boolean" }).notNull().default(true),
    // idea: suggested by the AI, no picture yet; generating: the picture is being drawn; rendering: sizes being made.
    status: text("status", { enum: ["idea", "generating", "rendering", "ready", "failed"] }).notNull().default("rendering"),
    error: text("error"),
    costUsd: real("cost_usd").notNull().default(0),
    renders: json<AdRender[]>("renders").notNull().default(sql`'[]'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ad_creatives_campaign_idx").on(t.campaignId, t.createdAt)],
);

/**
 * What the founder spent (AD3), entered by hand from the platform's ad manager: for one
 * ad, or for the whole campaign when adId is null, over a range of local days.
 */
export const adSpend = sqliteTable(
  "ad_spend",
  {
    id: id(),
    workspaceId: workspaceId(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => adCampaigns.id, { onDelete: "cascade" }),
    // Plan again replaces the ads; their spend stays, counted for the whole campaign.
    adId: text("ad_id").references(() => ads.id, { onDelete: "set null" }),
    startDay: text("start_day").notNull(),
    endDay: text("end_day").notNull(),
    amount: real("amount").notNull(),
    clicks: integer("clicks"),
    impressions: integer("impressions"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ad_spend_campaign_idx").on(t.campaignId, t.startDay)],
);

// --- Marketing planning: calendar, content plans, social images, replies, benchmarks (migration 0024) ---

/** One slot a content plan proposed; `pieceId` is the Content Studio piece made for it. */
export type ContentPlanItem = { day: string; time: string | null; channel: string; format: string; topic: string; why: string; pieceId: string | null };

/**
 * An AI content plan (content_plan job): one run that fills a range of days with
 * planned Content Studio pieces (content_pieces.plan_id), grounded in Intel, the
 * weekly analytics read-out and what worked. Failures are kept with the error.
 */
export const contentPlans = sqliteTable(
  "content_plans",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    startDay: text("start_day").notNull(), // YYYY-MM-DD, local days
    endDay: text("end_day").notNull(),
    channels: stringList("channels"),
    postsPerWeek: integer("posts_per_week").notNull().default(5),
    guidance: text("guidance"),
    status: text("status", { enum: ["working", "ready", "failed"] }).notNull().default("working"),
    error: text("error"),
    summary: text("summary"),
    items: json<ContentPlanItem[]>("items").notNull().default(sql`'[]'`),
    model: text("model"),
    costUsd: real("cost_usd").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("content_plans_product_idx").on(t.productId, t.createdAt)],
);

export const contentImageSizes = ["1:1", "4:5", "16:9", "1.91:1"] as const;
export type ContentImageSize = (typeof contentImageSizes)[number];
export type ContentImageRender = { size: ContentImageSize; width: number; height: number; file: string; bytes: number; fit?: "small" | "overflow" };

/**
 * A social post image for a Content Studio piece: the ad creative pipeline (ads/templates.ts,
 * ads/render.ts, the `image` task) at the sizes the piece's channel takes. Same columns as
 * ad_creatives, tied to a piece instead of a campaign. Files under <data>/content/images/<id>/.
 */
export const contentImages = sqliteTable(
  "content_images",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    pieceId: text("piece_id")
      .notNull()
      .references(() => contentPieces.id, { onDelete: "cascade" }),
    concept: text("concept").notNull().default(""),
    prompt: text("prompt"),
    imageSource: text("image_source", { enum: ["ai", "upload", "none"] }).notNull().default("ai"),
    imageFile: text("image_file"),
    template: text("template", { enum: adTemplates }).notNull().default("overlay"),
    text: json<AdCreativeText>("text").notNull().default(sql`'{"headline":""}'`),
    colors: json<AdCreativeColors>("colors").notNull().default(sql`'{"background":"#111827","text":"#ffffff","accent":"#f59e0b"}'`),
    useLogo: integer("use_logo", { mode: "boolean" }).notNull().default(true),
    status: text("status", { enum: ["idea", "generating", "rendering", "ready", "failed"] }).notNull().default("rendering"),
    error: text("error"),
    costUsd: real("cost_usd").notNull().default(0),
    renders: json<ContentImageRender[]>("renders").notNull().default(sql`'[]'`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("content_images_piece_idx").on(t.pieceId, t.createdAt)],
);

/**
 * Replies to the owner's own posts (an Inbox reply or a Content Studio piece), read by
 * engagement_sync through public APIs. Exactly one of publicationId / pieceId is set.
 * "Draft an answer" turns a reply into a conversation (origin "reply") and an
 * opportunity, so drafts, Post… and tracking work as for any reply (`opportunityId`).
 */
export const publicationReplies = sqliteTable(
  "publication_replies",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    publicationId: text("publication_id").references(() => publications.id, { onDelete: "cascade" }),
    pieceId: text("piece_id").references(() => contentPieces.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: channels }).notNull(),
    externalId: text("external_id").notNull(),
    /** The external id of what it answers: the post itself, or another reply (for nesting). */
    inReplyTo: text("in_reply_to"),
    url: text("url").notNull(),
    author: text("author"),
    body: text("body").notNull().default(""),
    postedAt: timestamp("posted_at"),
    status: text("status", { enum: ["new", "seen", "answered", "dismissed"] }).notNull().default("new"),
    opportunityId: text("opportunity_id").references(() => opportunities.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("publication_replies_external_idx").on(t.productId, t.channel, t.externalId),
    index("publication_replies_status_idx").on(t.productId, t.status, t.postedAt),
    index("publication_replies_publication_idx").on(t.publicationId),
    index("publication_replies_piece_idx").on(t.pieceId),
  ],
);

/**
 * A person at a competitor worth following (a founder, an executive, a developer advocate):
 * suggested by competitor_research or added by the owner. Public, professional profiles only.
 * `links` are every profile found; the readable ones become competitor_accounts when followed.
 */
export const competitorPeople = sqliteTable(
  "competitor_people",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    competitorId: text("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    why: text("why").notNull().default(""),
    links: json<PersonLink[]>("links").notNull().default(sql`'[]'`),
    status: text("status", { enum: ["suggested", "following", "ignored"] }).notNull().default("following"),
    source: text("source", { enum: sources }).notNull().default("owner"),
    /** Rolled up from their link briefs and posts while followed. */
    brief: json<PersonBrief>("brief"),
    briefedAt: timestamp("briefed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("competitor_people_competitor_idx").on(t.competitorId)],
);

/**
 * Channels whose public accounts can be followed ("x" is never read: no user lookups on X, section 3; "rss" is a blog or
 * newsletter feed, posts only; "page" a watched web page, its changes as posts; "search" a LinkedIn or X link that is
 * never fetched, only briefed from web search).
 */
export const benchmarkChannels = ["bluesky", "mastodon", "reddit", "hackernews", "x", "rss", "page", "search"] as const;

/** What a followed link is and says (competitor_digest): written from its posts or page, or from web search for "search" links. */
export type LinkBrief = {
  summary: string;
  covers: string[];
  recent: string[];
  lastChange: string;
  from: "read" | "web_search";
  urls: string[];
};

/** A followed person, from their link briefs and recent posts (competitor_digest). */
export type PersonBrief = { summary: string; topics: string[]; hints: string[]; activity: string; urls: string[] };
export type BenchmarkChannel = (typeof benchmarkChannels)[number];

/**
 * A public account to benchmark: a competitor's (competitorId set) or the owner's own
 * (competitorId null), by handle per channel: "name.bsky.social", "@name@server",
 * a Reddit or HN username, an X handle.
 */
export const competitorAccounts = sqliteTable(
  "competitor_accounts",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    competitorId: text("competitor_id").references(() => competitors.id, { onDelete: "cascade" }),
    /** Set for a person's account (competitor watch); benchmarks only chart company and own accounts. */
    personId: text("person_id").references(() => competitorPeople.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: benchmarkChannels }).notNull(),
    handle: text("handle").notNull(),
    url: text("url"),
    status: text("status", { enum: ["untested", "ok", "error"] }).notNull().default("untested"),
    lastError: text("last_error"),
    lastCheckedAt: timestamp("last_checked_at"),
    /** What the link is and says; rewritten when new posts or changes arrive (web-search links at most weekly). */
    brief: json<LinkBrief>("brief"),
    briefedAt: timestamp("briefed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("competitor_accounts_handle_idx").on(t.productId, t.channel, t.handle),
    index("competitor_accounts_competitor_idx").on(t.competitorId),
  ],
);

/**
 * One day of a benchmarked account (competitor_sync): followers and total posts as the
 * channel reports them, karma for Reddit and HN, and the posts seen in the last 7 days
 * with their average engagement (likes + reposts + replies, or score + comments).
 */
export const competitorSnapshots = sqliteTable(
  "competitor_snapshots",
  {
    id: id(),
    workspaceId: workspaceId(),
    accountId: text("account_id")
      .notNull()
      .references(() => competitorAccounts.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // YYYY-MM-DD, local
    followers: integer("followers"),
    totalPosts: integer("total_posts"),
    karma: integer("karma"),
    postsLast7: integer("posts_last_7"),
    avgEngagement: real("avg_engagement"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull().$defaultFn(now),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("competitor_snapshots_day_idx").on(t.accountId, t.day)],
);

/**
 * Recent public posts of a followed account (competitor_sync), newest 100 per account. `seenAt`
 * is set when the owner has seen it (the first read of an account marks what it found as seen).
 */
export const competitorPosts = sqliteTable(
  "competitor_posts",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    accountId: text("account_id")
      .notNull()
      .references(() => competitorAccounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    text: text("text").notNull().default(""),
    /** "change": a watched page changed; `text` holds what was added and removed. */
    kind: text("kind", { enum: ["post", "reply", "comment", "story", "article", "change"] }).notNull().default("post"),
    postedAt: timestamp("posted_at"),
    /** Likes + reposts + replies, or points + comments; null where the source doesn't say. */
    engagement: integer("engagement"),
    seenAt: timestamp("seen_at"),
    /** How much it matters for the product (score task); null until scored. */
    relevance: text("relevance", { enum: ["high", "medium", "low"] }),
    relevanceWhy: text("relevance_why"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("competitor_posts_external_idx").on(t.accountId, t.externalId), index("competitor_posts_product_idx").on(t.productId, t.postedAt)],
);

export type CompetitorDigest = {
  headline: string;
  items: { competitor: string; what: string; whyItMatters: string; urls: string[] }[];
  suggestions: string[];
  quiet: string[];
  /** What's new since the previous version of this period's brief (empty on the first). */
  sinceLast?: string[];
};

export const briefPeriods = ["day", "week", "month", "year"] as const;
export type BriefPeriod = (typeof briefPeriods)[number];

/**
 * A competitor brief for one day, week, month or year (competitor_digest). The current period's row is rewritten as new
 * material arrives; `closed` once the period ended and its final version is written. Rows from before periods are weeks.
 */
export const competitorDigests = sqliteTable(
  "competitor_digests",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    status: text("status", { enum: ["working", "ready", "failed"] }).notNull().default("working"),
    since: timestamp("since").notNull(),
    until: timestamp("until").notNull(),
    period: text("period", { enum: briefPeriods }).notNull().default("week"),
    /** The period's first local day, YYYY-MM-DD (null on rows from before periods). */
    periodStart: text("period_start"),
    closed: integer("closed", { mode: "boolean" }).notNull().default(false),
    digest: json<CompetitorDigest>("digest"),
    posts: integer("posts").notNull().default(0),
    error: text("error"),
    model: text("model"),
    seenAt: timestamp("seen_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("competitor_digests_product_idx").on(t.productId, t.createdAt), index("competitor_digests_period_idx").on(t.productId, t.period, t.periodStart)],
);

/** The last read of a watched page ("page" accounts): what changes are measured against. One row per account. */
export const competitorPages = sqliteTable(
  "competitor_pages",
  {
    id: id(),
    workspaceId: workspaceId(),
    accountId: text("account_id")
      .notNull()
      .references(() => competitorAccounts.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    title: text("title").notNull().default(""),
    text: text("text").notNull().default(""),
    fetchedAt: timestamp("fetched_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("competitor_pages_account_idx").on(t.accountId)],
);

// --- Search performance (ARCHITECTURE.md section 10.2) ----------------------------------------------

export const searchSources = ["google", "bing"] as const;
export type SearchSource = (typeof searchSources)[number];
export const searchKinds = ["total", "query", "page", "country", "device"] as const;
export type SearchKind = (typeof searchKinds)[number];

/**
 * One day of search results from Search Console or Bing Webmaster Tools, either the
 * site's total or split by one dimension (`key` is the query, page URL, country or device).
 * Position is the average position, weighted by impressions when days are combined.
 */
export const searchStats = sqliteTable(
  "search_stats",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    source: text("source", { enum: searchSources }).notNull(),
    day: text("day").notNull(), // YYYY-MM-DD
    kind: text("kind", { enum: searchKinds }).notNull(),
    key: text("key").notNull().default(""),
    clicks: integer("clicks").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    position: real("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("search_stats_unique_idx").on(t.productId, t.source, t.day, t.kind, t.key),
    index("search_stats_kind_idx").on(t.productId, t.source, t.kind, t.day),
  ],
);

// --- AI visibility (ARCHITECTURE.md section 10.2) --------------------------------------------------

export const promptStages = ["discover", "compare", "decide"] as const;
export type PromptStage = (typeof promptStages)[number];

/** A question people in the audience might ask an AI assistant, asked on every visibility run. */
export const aiPrompts = sqliteTable(
  "ai_prompts",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    text: text("text").notNull(),
    topic: text("topic").notNull().default(""),
    stage: text("stage", { enum: promptStages }).notNull().default("discover"),
    source: text("source", { enum: sources }).notNull().default("ai"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_prompts_product_idx").on(t.productId, t.active)],
);

/** Totals for one run, kept so history doesn't need every answer re-read. */
export type VisibilityMetrics = {
  answered: number;
  mentioned: number;
  recommended: number;
  /** Answers that cite one of the product's own pages. */
  cited: number;
  /** Average position among the products an answer names, where the product is named. */
  avgPosition: number | null;
  /** Answers mentioning each brand: the product's name first, then competitors. */
  brands: { name: string; answers: number; own: boolean }[];
};

export const aiVisibilityRuns = sqliteTable(
  "ai_visibility_runs",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    model: text("model").notNull(),
    status: text("status", { enum: ["running", "done", "failed", "cancelled"] }).notNull().default("running"),
    trigger: text("trigger", { enum: ["manual", "weekly"] }).notNull().default("manual"),
    promptCount: integer("prompt_count").notNull().default(0),
    capUsd: real("cap_usd").notNull(),
    costUsd: real("cost_usd").notNull().default(0),
    /** Why it ended early: the cost cap, a stop, or an error. */
    note: text("note"),
    metrics: json<VisibilityMetrics>("metrics"),
    startedAt: timestamp("started_at").notNull().$defaultFn(() => new Date()),
    finishedAt: timestamp("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_visibility_runs_product_idx").on(t.productId, t.startedAt)],
);

export type AnswerCitation = { url: string; title: string };

/** One question's answer in a run, and what the analysis found in it. */
export const aiVisibilityAnswers = sqliteTable(
  "ai_visibility_answers",
  {
    id: id(),
    workspaceId: workspaceId(),
    runId: text("run_id")
      .notNull()
      .references(() => aiVisibilityRuns.id, { onDelete: "cascade" }),
    promptId: text("prompt_id").references(() => aiPrompts.id, { onDelete: "set null" }),
    /** The question as it was asked (the prompt may be edited or deleted later). */
    promptText: text("prompt_text").notNull(),
    answer: text("answer").notNull().default(""),
    citations: json<AnswerCitation[]>("citations").notNull().default(sql`'[]'`),
    searches: json<string[]>("searches").notNull().default(sql`'[]'`),
    mentioned: integer("mentioned", { mode: "boolean" }).notNull().default(false),
    recommended: integer("recommended", { mode: "boolean" }).notNull().default(false),
    position: integer("position"),
    /** Every product the answer names, in order. */
    productsNamed: json<string[]>("products_named").notNull().default(sql`'[]'`),
    competitors: json<string[]>("competitors").notNull().default(sql`'[]'`),
    ownCitations: json<string[]>("own_citations").notNull().default(sql`'[]'`),
    description: text("description"),
    sentiment: text("sentiment", { enum: ["positive", "neutral", "negative"] }),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_visibility_answers_run_idx").on(t.runId), index("ai_visibility_answers_prompt_idx").on(t.promptId)],
);

// --- Opportunities and fixes (ARCHITECTURE.md section 10.2) -----------------------------------------

export const draftKinds = ["meta", "jsonld", "llms_txt", "faq"] as const;
export type DraftKind = (typeof draftKinds)[number];

/** A fix the AI drafted for an opportunity: copy-only text, checked before it's shown. */
export type OpportunityDraft = {
  kind: DraftKind;
  /** The text to copy: titles and descriptions, a JSON-LD block, an llms.txt file, an FAQ block. */
  text: string;
  /** Meta drafts: one suggestion per page. */
  pages?: { url: string; title: string; description: string }[];
  /** Problems the checks found in the draft (empty when it passed). */
  problems: string[];
  model: string;
  createdAt: string;
};

/**
 * What the owner did with an opportunity. Opportunities themselves are computed from the
 * latest data on every visit; this keeps state by their stable key (e.g. `query:field notes app`).
 */
export const seoOpportunities = sqliteTable(
  "seo_opportunities",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    key: text("key").notNull(),
    status: text("status", { enum: ["open", "done", "dismissed"] }).notNull().default("open"),
    draft: json<OpportunityDraft>("draft"),
    draftStatus: text("draft_status", { enum: ["drafting", "ready", "failed"] }),
    draftError: text("draft_error"),
    roadmapItemId: text("roadmap_item_id").references(() => roadmapItems.id, { onDelete: "set null" }),
    contentPieceId: text("content_piece_id").references(() => contentPieces.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("seo_opportunities_key_idx").on(t.productId, t.key)],
);

// --- Agent readiness (ARCHITECTURE.md section 10.3) ------------------------------------------------

export type AgentCheckResult = {
  id: string;
  status: "pass" | "warn" | "fail" | "info" | "unknown";
  summary: string;
  detail?: string[];
};

/** One agent readiness check of a site: its checks' results and score. Kept as history. */
export const agentChecks = sqliteTable(
  "agent_checks",
  {
    id: id(),
    workspaceId: workspaceId(),
    siteId: text("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    score: real("score"),
    results: json<AgentCheckResult[]>("results").notNull().default(sql`'[]'`),
    error: text("error"),
    checkedAt: timestamp("checked_at").notNull().$defaultFn(() => new Date()),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("agent_checks_site_idx").on(t.siteId, t.checkedAt)],
);

// --- Off-site presence (ARCHITECTURE.md section 10.4) ----------------------------------------------

/**
 * A page AI answers cited, as Startica last read it: does it mention the product or its
 * competitors? One row per product and URL; pages are re-read after AI visibility runs.
 */
export const offsitePages = sqliteTable(
  "offsite_pages",
  {
    id: id(),
    workspaceId: workspaceId(),
    productId: productId(),
    url: text("url").notNull(),
    domain: text("domain").notNull(),
    title: text("title"),
    status: text("status", { enum: ["read", "blocked_by_robots", "failed"] }).notNull(),
    httpStatus: integer("http_status"),
    mentionsProduct: integer("mentions_product", { mode: "boolean" }).notNull().default(false),
    competitors: json<string[]>("competitors").notNull().default(sql`'[]'`),
    error: text("error"),
    checkedAt: timestamp("checked_at").notNull().$defaultFn(() => new Date()),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("offsite_pages_url_idx").on(t.productId, t.url), index("offsite_pages_domain_idx").on(t.productId, t.domain)],
);

// --- Refine: chats about a suggestion (ARCHITECTURE.md section 5.1) --------------------------------

/**
 * What a chat can refine: a security finding's AI help, an accessibility issue's AI fix, an Inbox
 * reply draft (by opportunity), a Content Studio piece, an ad's copy.
 */
export const chatSubjectKinds = ["security_help", "a11y_fix", "reply_draft", "content_piece", "ad_copy"] as const;
export type ChatSubjectKind = (typeof chatSubjectKinds)[number];
export type ChatSource = { url: string; title: string };

/**
 * One conversation about one suggestion. A suggestion has at most one open thread; applying a
 * revision closes it ("applied") and the next Refine starts a new one. Start over closes it too.
 */
export const chatThreads = sqliteTable(
  "chat_threads",
  {
    id: id(),
    workspaceId: workspaceId(),
    subjectKind: text("subject_kind", { enum: chatSubjectKinds }).notNull(),
    subjectId: text("subject_id").notNull(),
    status: text("status", { enum: ["open", "applied", "closed"] }).notNull().default("open"),
    appliedMessageId: text("applied_message_id"),
    closedAt: timestamp("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("chat_threads_subject_idx").on(t.workspaceId, t.subjectKind, t.subjectId, t.status)],
);

/**
 * A turn in a chat. Assistant turns are written by the chat_reply job: pending, then streaming
 * (the body grows as the model writes), then done, failed or cancelled. A turn that revises the
 * suggestion carries the full revision in `proposal`, in the shape of the subject's AI output.
 */
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: id(),
    workspaceId: workspaceId(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    body: text("body").notNull().default(""),
    status: text("status", { enum: ["pending", "streaming", "done", "failed", "cancelled"] }).notNull().default("done"),
    error: text("error"),
    proposal: json<Record<string, unknown>>("proposal"),
    proposalStatus: text("proposal_status", { enum: ["proposed", "applied"] }),
    sources: json<ChatSource[]>("sources"),
    webSearch: integer("web_search", { mode: "boolean" }).notNull().default(false),
    model: text("model"),
    jobRunId: text("job_run_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("chat_messages_thread_idx").on(t.threadId, t.createdAt)],
);

/**
 * Every version of a refinable suggestion (the stored shape, e.g. SecurityAiHelp), so the owner can
 * go back. The one applied last (`appliedAt`) is what the subject shows now.
 */
export const suggestionVersions = sqliteTable(
  "suggestion_versions",
  {
    id: id(),
    workspaceId: workspaceId(),
    subjectKind: text("subject_kind", { enum: chatSubjectKinds }).notNull(),
    subjectId: text("subject_id").notNull(),
    value: json<Record<string, unknown>>("value").notNull(),
    /** suggested: written by the AI (Explain, Suggest a fix, Regenerate…). chat: a revision applied from a chat. edited: saved by the owner. */
    source: text("source", { enum: ["suggested", "chat", "edited"] }).notNull(),
    threadId: text("thread_id"),
    appliedAt: timestamp("applied_at").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("suggestion_versions_subject_idx").on(t.workspaceId, t.subjectKind, t.subjectId)],
);

export { sql };
