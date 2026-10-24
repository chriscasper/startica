CREATE TABLE `a11y_fix_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`site_id` text NOT NULL,
	`group_ids` text NOT NULL,
	`guidance` text,
	`status` text DEFAULT 'working' NOT NULL,
	`error` text,
	`plan` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `a11y_fix_plans_site_idx` ON `a11y_fix_plans` (`site_id`,`created_at`);