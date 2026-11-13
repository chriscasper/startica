CREATE TABLE `ai_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`input_file_id` text,
	`purpose` text NOT NULL,
	`task` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`items` text NOT NULL,
	`succeeded` integer DEFAULT 0 NOT NULL,
	`errored` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`polls` integer DEFAULT 0 NOT NULL,
	`error` text,
	`submitted_at` integer NOT NULL,
	`ended_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_batches_status_idx` ON `ai_batches` (`workspace_id`,`status`);--> statement-breakpoint
ALTER TABLE `ai_runs` ADD `batch_id` text REFERENCES ai_batches(id) ON DELETE set null;