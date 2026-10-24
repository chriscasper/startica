CREATE TABLE `competitor_digests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`status` text DEFAULT 'working' NOT NULL,
	`since` integer NOT NULL,
	`until` integer NOT NULL,
	`digest` text,
	`posts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`model` text,
	`seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitor_digests_product_idx` ON `competitor_digests` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `competitor_people` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`competitor_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`why` text DEFAULT '' NOT NULL,
	`links` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'following' NOT NULL,
	`source` text DEFAULT 'owner' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitor_people_competitor_idx` ON `competitor_people` (`competitor_id`);--> statement-breakpoint
CREATE TABLE `competitor_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`account_id` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`text` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'post' NOT NULL,
	`posted_at` integer,
	`engagement` integer,
	`seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `competitor_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitor_posts_external_idx` ON `competitor_posts` (`account_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `competitor_posts_product_idx` ON `competitor_posts` (`product_id`,`posted_at`);--> statement-breakpoint
ALTER TABLE `competitor_accounts` ADD `person_id` text REFERENCES competitor_people(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `competitors` ADD `profile` text;--> statement-breakpoint
ALTER TABLE `competitors` ADD `profile_status` text;--> statement-breakpoint
ALTER TABLE `competitors` ADD `profile_error` text;--> statement-breakpoint
ALTER TABLE `competitors` ADD `profiled_at` integer;