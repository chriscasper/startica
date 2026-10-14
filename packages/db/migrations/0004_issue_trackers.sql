CREATE TABLE `issue_trackers` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`provider` text NOT NULL,
	`base_url` text NOT NULL,
	`repo` text NOT NULL,
	`secret_id` text,
	`labels` text NOT NULL,
	`auto_min_impact` text,
	`close_when_fixed` integer DEFAULT true NOT NULL,
	`status` text DEFAULT 'untested' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issue_trackers_product_idx` ON `issue_trackers` (`product_id`);--> statement-breakpoint
CREATE TABLE `tracker_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`tracker_id` text NOT NULL,
	`source_kind` text DEFAULT 'a11y' NOT NULL,
	`source_id` text NOT NULL,
	`number` integer NOT NULL,
	`url` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tracker_id`) REFERENCES `issue_trackers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracker_issues_source_idx` ON `tracker_issues` (`tracker_id`,`source_kind`,`source_id`);