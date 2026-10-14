CREATE TABLE `seo_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`page_id` text,
	`rule` text NOT NULL,
	`severity` text NOT NULL,
	`group_key` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`page_id`) REFERENCES `site_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `seo_findings_site_idx` ON `seo_findings` (`site_id`,`rule`);--> statement-breakpoint
CREATE INDEX `seo_findings_page_idx` ON `seo_findings` (`page_id`);--> statement-breakpoint
ALTER TABLE `site_pages` ADD `in_sitemap` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `site_pages` ADD `links` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_pages` ADD `seo` text;--> statement-breakpoint
ALTER TABLE `site_pages` ADD `seo_score` real;--> statement-breakpoint
ALTER TABLE `site_scans` ADD `seo_score` real;--> statement-breakpoint
ALTER TABLE `sites` ADD `seo_score` real;--> statement-breakpoint
ALTER TABLE `sites` ADD `ai_access` text;