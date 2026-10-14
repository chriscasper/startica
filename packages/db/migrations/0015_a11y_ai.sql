CREATE TABLE `a11y_images` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`src` text NOT NULL,
	`alt` text,
	`decorative` integer DEFAULT false NOT NULL,
	`pages_count` integer DEFAULT 0 NOT NULL,
	`sample_page` text,
	`verdict` text,
	`judged_alt` text,
	`suggested_alt` text,
	`reason` text,
	`model` text,
	`status` text DEFAULT 'new' NOT NULL,
	`error` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `a11y_images_src_idx` ON `a11y_images` (`site_id`,`src`);--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `ai_fix` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `ai_fix_status` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `ai_fix_error` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `ai_review` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `ai_review_status` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `ai_review_error` text;--> statement-breakpoint
ALTER TABLE `site_pages` ADD `images` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `a11y_summary` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `a11y_summary_status` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `a11y_summary_error` text;