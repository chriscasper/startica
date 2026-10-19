CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'done' NOT NULL,
	`error` text,
	`proposal` text,
	`proposal_status` text,
	`sources` text,
	`web_search` integer DEFAULT false NOT NULL,
	`model` text,
	`job_run_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_idx` ON `chat_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`applied_message_id` text,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_threads_subject_idx` ON `chat_threads` (`workspace_id`,`subject_kind`,`subject_id`,`status`);--> statement-breakpoint
CREATE TABLE `suggestion_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`subject_kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`thread_id` text,
	`applied_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `suggestion_versions_subject_idx` ON `suggestion_versions` (`workspace_id`,`subject_kind`,`subject_id`);