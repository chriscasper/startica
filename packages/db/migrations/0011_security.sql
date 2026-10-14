CREATE TABLE `security_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`group_key` text NOT NULL,
	`rule` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`reason` text,
	`decided_at` integer,
	`pages_count` integer DEFAULT 0 NOT NULL,
	`detail` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`first_seen_scan_id` text,
	`fixed_at` integer,
	`fixed_scan_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `security_findings_key_idx` ON `security_findings` (`site_id`,`group_key`);--> statement-breakpoint
CREATE TABLE `security_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`page_id` text,
	`rule` text NOT NULL,
	`group_key` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `security_occurrences_site_idx` ON `security_occurrences` (`site_id`,`group_key`);--> statement-breakpoint
CREATE INDEX `security_occurrences_page_idx` ON `security_occurrences` (`page_id`);--> statement-breakpoint
ALTER TABLE `site_scans` ADD `security_score` real;--> statement-breakpoint
ALTER TABLE `sites` ADD `security_token` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `security_verified_at` integer;--> statement-breakpoint
ALTER TABLE `sites` ADD `security_verified_by` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `security_score` real;--> statement-breakpoint
ALTER TABLE `sites` ADD `security_checked_at` integer;--> statement-breakpoint
ALTER TABLE `sites` ADD `security` text;