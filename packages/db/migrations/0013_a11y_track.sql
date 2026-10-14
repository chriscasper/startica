ALTER TABLE `a11y_issue_groups` ADD `ignore_note` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `ignored_at` integer;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `review_status` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `review_note` text;--> statement-breakpoint
ALTER TABLE `a11y_issue_groups` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `a11y_occurrences` ADD `box` text;--> statement-breakpoint
ALTER TABLE `site_pages` ADD `screenshot` text;--> statement-breakpoint
ALTER TABLE `site_pages` ADD `screenshot_size` text;