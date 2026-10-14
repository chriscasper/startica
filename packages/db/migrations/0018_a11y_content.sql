CREATE TABLE `site_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`url` text NOT NULL,
	`status` text NOT NULL,
	`http_status` integer,
	`bytes` integer,
	`checks` text,
	`problems` text NOT NULL,
	`linked_from` text NOT NULL,
	`error` text,
	`checked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_documents_url_idx` ON `site_documents` (`site_id`,`url`);--> statement-breakpoint
CREATE TABLE `site_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`page_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `site_findings_site_idx` ON `site_findings` (`site_id`,`kind`);--> statement-breakpoint
CREATE INDEX `site_findings_page_idx` ON `site_findings` (`page_id`);--> statement-breakpoint
CREATE TABLE `site_links` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`url` text NOT NULL,
	`http_status` integer,
	`error` text,
	`linked_from` text NOT NULL,
	`checked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `site_links_url_idx` ON `site_links` (`site_id`,`url`);--> statement-breakpoint
ALTER TABLE `site_pages` ADD `readability` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `content_rules` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `spelling_ignore` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `readability_target` integer DEFAULT 9 NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `content_checked_at` integer;