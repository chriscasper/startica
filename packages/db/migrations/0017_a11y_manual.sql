CREATE TABLE `a11y_criteria_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`criterion` text NOT NULL,
	`status` text DEFAULT 'not_tested' NOT NULL,
	`note` text,
	`remark` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `a11y_criteria_reviews_idx` ON `a11y_criteria_reviews` (`site_id`,`criterion`);--> statement-breakpoint
ALTER TABLE `sites` ADD `a11y_statement` text;