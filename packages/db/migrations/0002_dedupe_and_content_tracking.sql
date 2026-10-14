CREATE TABLE `content_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`piece_id` text NOT NULL,
	`score` integer,
	`replies` integer,
	`removed` integer DEFAULT false NOT NULL,
	`captured_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`piece_id`) REFERENCES `content_pieces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `content_snapshots_piece_idx` ON `content_snapshots` (`piece_id`,`captured_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `fingerprint` text;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `duplicate_of_id` text REFERENCES opportunities(id) ON DELETE set null;