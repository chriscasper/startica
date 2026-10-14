CREATE TABLE `seo_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`key` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`draft` text,
	`draft_status` text,
	`draft_error` text,
	`roadmap_item_id` text,
	`content_piece_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`roadmap_item_id`) REFERENCES `roadmap_items`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`content_piece_id`) REFERENCES `content_pieces`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seo_opportunities_key_idx` ON `seo_opportunities` (`product_id`,`key`);