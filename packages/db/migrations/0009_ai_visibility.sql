CREATE TABLE `ai_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`text` text NOT NULL,
	`topic` text DEFAULT '' NOT NULL,
	`stage` text DEFAULT 'discover' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_prompts_product_idx` ON `ai_prompts` (`product_id`,`active`);--> statement-breakpoint
CREATE TABLE `ai_visibility_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`run_id` text NOT NULL,
	`prompt_id` text,
	`prompt_text` text NOT NULL,
	`answer` text DEFAULT '' NOT NULL,
	`citations` text DEFAULT '[]' NOT NULL,
	`searches` text DEFAULT '[]' NOT NULL,
	`mentioned` integer DEFAULT false NOT NULL,
	`recommended` integer DEFAULT false NOT NULL,
	`position` integer,
	`products_named` text DEFAULT '[]' NOT NULL,
	`competitors` text DEFAULT '[]' NOT NULL,
	`own_citations` text DEFAULT '[]' NOT NULL,
	`description` text,
	`sentiment` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `ai_visibility_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `ai_prompts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_answers_run_idx` ON `ai_visibility_answers` (`run_id`);--> statement-breakpoint
CREATE INDEX `ai_visibility_answers_prompt_idx` ON `ai_visibility_answers` (`prompt_id`);--> statement-breakpoint
CREATE TABLE `ai_visibility_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`prompt_count` integer DEFAULT 0 NOT NULL,
	`cap_usd` real NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`note` text,
	`metrics` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_runs_product_idx` ON `ai_visibility_runs` (`product_id`,`started_at`);--> statement-breakpoint
-- Existing workspaces get the new "answer" task (AI visibility), on the provider their drafts use.
INSERT INTO `ai_models` (`id`, `workspace_id`, `task`, `model`, `effort`, `max_tokens`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  w.`id`,
  'answer',
  CASE WHEN d.`model` LIKE 'gpt-%' THEN 'gpt-6.1-sol' ELSE 'claude-sonnet-5-5' END,
  'low',
  CASE WHEN d.`model` LIKE 'gpt-%' THEN 8000 ELSE 4000 END,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `workspaces` w
LEFT JOIN `ai_models` d ON d.`workspace_id` = w.`id` AND d.`task` = 'draft'
WHERE NOT EXISTS (SELECT 1 FROM `ai_models` a WHERE a.`workspace_id` = w.`id` AND a.`task` = 'answer');
