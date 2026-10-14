CREATE TABLE `a11y_issue_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`kind` text DEFAULT 'violation' NOT NULL,
	`rule_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`impact` text,
	`help` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`help_url` text,
	`tags` text NOT NULL,
	`criteria` text NOT NULL,
	`level` text,
	`sample_selector` text,
	`sample_html` text,
	`pages_count` integer DEFAULT 0 NOT NULL,
	`occurrences_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`ignore_reason` text,
	`first_seen_scan_id` text,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`fixed_at` integer,
	`fixed_scan_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `a11y_groups_fingerprint_idx` ON `a11y_issue_groups` (`site_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `a11y_groups_status_idx` ON `a11y_issue_groups` (`site_id`,`status`);--> statement-breakpoint
CREATE TABLE `a11y_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`page_id` text NOT NULL,
	`group_id` text NOT NULL,
	`selector` text NOT NULL,
	`html` text DEFAULT '' NOT NULL,
	`failure_summary` text,
	`impact` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `a11y_issue_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `a11y_occurrences_page_idx` ON `a11y_occurrences` (`page_id`);--> statement-breakpoint
CREATE INDEX `a11y_occurrences_group_idx` ON `a11y_occurrences` (`group_id`);--> statement-breakpoint
CREATE TABLE `site_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`url` text NOT NULL,
	`title` text,
	`lang` text,
	`http_status` integer,
	`depth` integer DEFAULT 0 NOT NULL,
	`scan_id` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`score` real,
	`impacts` text,
	`needs_review` integer DEFAULT 0 NOT NULL,
	`error` text,
	`last_scanned_at` integer,
	`gone_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_pages_url_idx` ON `site_pages` (`site_id`,`url`);--> statement-breakpoint
CREATE INDEX `site_pages_scan_idx` ON `site_pages` (`scan_id`,`state`);--> statement-breakpoint
CREATE TABLE `site_scans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`scope` text DEFAULT 'full' NOT NULL,
	`trigger` text DEFAULT 'manual' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`pages_done` integer DEFAULT 0 NOT NULL,
	`pages_failed` integer DEFAULT 0 NOT NULL,
	`axe_version` text,
	`score` real,
	`impacts` text,
	`needs_review` integer,
	`new_issues` integer,
	`fixed_issues` integer,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_scans_site_idx` ON `site_scans` (`site_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`start_url` text NOT NULL,
	`include` text NOT NULL,
	`exclude` text NOT NULL,
	`max_pages` integer DEFAULT 250 NOT NULL,
	`max_depth` integer DEFAULT 6 NOT NULL,
	`respect_robots` integer DEFAULT true NOT NULL,
	`include_aaa` integer DEFAULT false NOT NULL,
	`include_best_practice` integer DEFAULT false NOT NULL,
	`scan_interval_days` integer DEFAULT 7 NOT NULL,
	`target_score` integer DEFAULT 90 NOT NULL,
	`ownership_confirmed_at` integer NOT NULL,
	`last_scan_id` text,
	`score` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sites_product_idx` ON `sites` (`product_id`);