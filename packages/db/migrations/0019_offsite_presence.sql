CREATE TABLE `offsite_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`title` text,
	`status` text NOT NULL,
	`http_status` integer,
	`mentions_product` integer DEFAULT false NOT NULL,
	`competitors` text DEFAULT '[]' NOT NULL,
	`error` text,
	`checked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offsite_pages_url_idx` ON `offsite_pages` (`product_id`,`url`);--> statement-breakpoint
CREATE INDEX `offsite_pages_domain_idx` ON `offsite_pages` (`product_id`,`domain`);