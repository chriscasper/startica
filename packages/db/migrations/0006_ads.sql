CREATE TABLE `ad_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`platform` text NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`landing_url` text NOT NULL,
	`monthly_budget` real DEFAULT 300 NOT NULL,
	`test_budget` real,
	`test_days` integer,
	`success_metric` text,
	`bid_strategy` text,
	`summary` text,
	`status` text DEFAULT 'planning' NOT NULL,
	`error` text,
	`utm_campaign` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ad_campaigns_product_idx` ON `ad_campaigns` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ad_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`angle` text,
	`targeting` text DEFAULT '{}' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `ad_campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ad_groups_campaign_idx` ON `ad_groups` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `ads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`group_id` text NOT NULL,
	`copy` text DEFAULT '{}' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `ad_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ads_group_idx` ON `ads` (`group_id`);