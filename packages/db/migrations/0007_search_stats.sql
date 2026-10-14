CREATE TABLE `search_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`source` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`key` text DEFAULT '' NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `search_stats_unique_idx` ON `search_stats` (`product_id`,`source`,`day`,`kind`,`key`);--> statement-breakpoint
CREATE INDEX `search_stats_kind_idx` ON `search_stats` (`product_id`,`source`,`kind`,`day`);