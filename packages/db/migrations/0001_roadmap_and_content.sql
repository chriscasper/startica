CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`summary` text,
	`findings` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audits_product_idx` ON `audits` (`product_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_pieces` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`voice_profile_id` text,
	`channel` text NOT NULL,
	`format` text DEFAULT 'post' NOT NULL,
	`topic` text NOT NULL,
	`title` text,
	`body` text DEFAULT '' NOT NULL,
	`rationale` text,
	`utm_url` text,
	`status` text DEFAULT 'drafting' NOT NULL,
	`posted_url` text,
	`posted_at` integer,
	`notes` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voice_profile_id`) REFERENCES `voice_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `content_product_idx` ON `content_pieces` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `daily_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`day` text NOT NULL,
	`rank` integer NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`href` text,
	`ref_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'system' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `moves_day_idx` ON `daily_moves` (`product_id`,`day`);--> statement-breakpoint
CREATE TABLE `roadmap_items` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`stage` text NOT NULL,
	`title` text NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`playbook` text,
	`success_metric` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`priority` integer DEFAULT 3 NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`result` text,
	`source` text DEFAULT 'owner' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `roadmap_product_idx` ON `roadmap_items` (`product_id`,`status`,`priority`);--> statement-breakpoint
CREATE TABLE `roadmap_replans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`summary` text NOT NULL,
	`changes` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `replans_product_idx` ON `roadmap_replans` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `voice_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`source_ids` text NOT NULL,
	`guide` text,
	`status` text DEFAULT 'building' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_profiles_product_idx` ON `voice_profiles` (`product_id`);--> statement-breakpoint
CREATE TABLE `voice_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`source_id` text NOT NULL,
	`text` text NOT NULL,
	`url` text,
	`posted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_id`) REFERENCES `voice_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_samples_source_idx` ON `voice_samples` (`source_id`);--> statement-breakpoint
CREATE TABLE `voice_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`handle` text,
	`url` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_sources_product_idx` ON `voice_sources` (`product_id`);