CREATE TABLE `security_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`detail` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`changed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_assets_name_idx` ON `security_assets` (`site_id`,`kind`,`name`);--> statement-breakpoint
CREATE TABLE `security_components` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`page_id` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`via` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `security_components_site_idx` ON `security_components` (`site_id`,`name`,`version`);--> statement-breakpoint
CREATE INDEX `security_components_page_idx` ON `security_components` (`page_id`);--> statement-breakpoint
ALTER TABLE `issue_trackers` ADD `auto_min_security` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `security_monitor` text;