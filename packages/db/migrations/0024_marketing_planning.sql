CREATE TABLE `competitor_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`competitor_id` text,
	`channel` text NOT NULL,
	`handle` text NOT NULL,
	`url` text,
	`status` text DEFAULT 'untested' NOT NULL,
	`last_error` text,
	`last_checked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitor_accounts_handle_idx` ON `competitor_accounts` (`product_id`,`channel`,`handle`);--> statement-breakpoint
CREATE INDEX `competitor_accounts_competitor_idx` ON `competitor_accounts` (`competitor_id`);--> statement-breakpoint
CREATE TABLE `competitor_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`day` text NOT NULL,
	`followers` integer,
	`total_posts` integer,
	`karma` integer,
	`posts_last_7` integer,
	`avg_engagement` real,
	`captured_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `competitor_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitor_snapshots_day_idx` ON `competitor_snapshots` (`account_id`,`day`);--> statement-breakpoint
CREATE TABLE `content_images` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`piece_id` text NOT NULL,
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
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`piece_id`) REFERENCES `content_pieces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_images_piece_idx` ON `content_images` (`piece_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`start_day` text NOT NULL,
	`end_day` text NOT NULL,
	`channels` text NOT NULL,
	`posts_per_week` integer DEFAULT 5 NOT NULL,
	`guidance` text,
	`status` text DEFAULT 'working' NOT NULL,
	`error` text,
	`summary` text,
	`items` text DEFAULT '[]' NOT NULL,
	`model` text,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_plans_product_idx` ON `content_plans` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `publication_replies` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`publication_id` text,
	`piece_id` text,
	`channel` text NOT NULL,
	`external_id` text NOT NULL,
	`in_reply_to` text,
	`url` text NOT NULL,
	`author` text,
	`body` text DEFAULT '' NOT NULL,
	`posted_at` integer,
	`status` text DEFAULT 'new' NOT NULL,
	`opportunity_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`publication_id`) REFERENCES `publications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`piece_id`) REFERENCES `content_pieces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `opportunities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_replies_external_idx` ON `publication_replies` (`product_id`,`channel`,`external_id`);--> statement-breakpoint
CREATE INDEX `publication_replies_status_idx` ON `publication_replies` (`product_id`,`status`,`posted_at`);--> statement-breakpoint
CREATE INDEX `publication_replies_publication_idx` ON `publication_replies` (`publication_id`);--> statement-breakpoint
CREATE INDEX `publication_replies_piece_idx` ON `publication_replies` (`piece_id`);--> statement-breakpoint
ALTER TABLE `content_pieces` ADD `planned_at` integer;--> statement-breakpoint
ALTER TABLE `content_pieces` ADD `reminded_at` integer;--> statement-breakpoint
ALTER TABLE `content_pieces` ADD `plan_id` text REFERENCES content_plans(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `content_pieces` ADD `plan_why` text;--> statement-breakpoint
CREATE INDEX `content_planned_idx` ON `content_pieces` (`product_id`,`planned_at`);--> statement-breakpoint
ALTER TABLE `opportunities` ADD `sentiment` text;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `matched_keywords` text;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `mentions` text;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `planned_at` integer;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `reminded_at` integer;--> statement-breakpoint
CREATE INDEX `opportunities_planned_idx` ON `opportunities` (`product_id`,`planned_at`);