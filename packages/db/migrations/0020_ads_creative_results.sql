CREATE TABLE `ad_creatives` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`ad_id` text,
	`concept` text DEFAULT '' NOT NULL,
	`prompt` text,
	`image_source` text DEFAULT 'ai' NOT NULL,
	`image_file` text,
	`template` text DEFAULT 'overlay' NOT NULL,
	`text` text DEFAULT '{"headline":""}' NOT NULL,
	`colors` text DEFAULT '{"background":"#111827","text":"#ffffff","accent":"#f59e0b"}' NOT NULL,
	`use_logo` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'rendering' NOT NULL,
	`error` text,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`renders` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ad_creatives_campaign_idx` ON `ad_creatives` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ad_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`ad_id` text,
	`start_day` text NOT NULL,
	`end_day` text NOT NULL,
	`amount` real NOT NULL,
	`clicks` integer,
	`impressions` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ad_spend_campaign_idx` ON `ad_spend` (`campaign_id`,`start_day`);--> statement-breakpoint
ALTER TABLE `ad_campaigns` ADD `target_cost` real;--> statement-breakpoint
-- Existing workspaces get the new "image" task (Ads AD2): OpenAI's image model, medium quality.
INSERT INTO `ai_models` (`id`, `workspace_id`, `task`, `model`, `effort`, `max_tokens`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  w.`id`, 'image', 'gpt-image-2.5-flare', 'medium', 4096,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM `workspaces` w
WHERE NOT EXISTS (SELECT 1 FROM `ai_models` a WHERE a.`workspace_id` = w.`id` AND a.`task` = 'image');
