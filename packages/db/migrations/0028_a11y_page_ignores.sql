CREATE TABLE `a11y_page_ignores` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`url` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`ignored_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `a11y_page_ignores_idx` ON `a11y_page_ignores` (`site_id`,`fingerprint`,`url`);--> statement-breakpoint
ALTER TABLE `a11y_occurrences` ADD `ignored` integer DEFAULT false NOT NULL;