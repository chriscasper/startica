-- Supabase is connected with SQL the owner runs and a read-only login (PLAN.md 8.2):
-- the sign-in is gone, so delete its saved tokens and OAuth client credentials too.
DELETE FROM `secrets` WHERE `id` IN (SELECT `secret_id` FROM `integrations` WHERE `secret_id` IS NOT NULL) OR `name` IN ('supabase_oauth_client', 'google_oauth_client');--> statement-breakpoint
DROP TABLE `integrations`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`secret_id` text,
	`status` text DEFAULT 'untested' NOT NULL,
	`last_synced_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`secret_id`) REFERENCES `secrets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_connections`("id", "workspace_id", "product_id", "kind", "config", "secret_id", "status", "last_synced_at", "last_error", "created_at", "updated_at") SELECT "id", "workspace_id", "product_id", "kind", "config", "secret_id", "status", "last_synced_at", "last_error", "created_at", "updated_at" FROM `connections`;--> statement-breakpoint
DROP TABLE `connections`;--> statement-breakpoint
ALTER TABLE `__new_connections` RENAME TO `connections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `connections_kind_idx` ON `connections` (`product_id`,`kind`);