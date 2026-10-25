CREATE TABLE `competitor_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`account_id` text NOT NULL,
	`hash` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`fetched_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `competitor_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitor_pages_account_idx` ON `competitor_pages` (`account_id`);--> statement-breakpoint
ALTER TABLE `competitor_accounts` ADD `brief` text;--> statement-breakpoint
ALTER TABLE `competitor_accounts` ADD `briefed_at` integer;--> statement-breakpoint
ALTER TABLE `competitor_digests` ADD `period` text DEFAULT 'week' NOT NULL;--> statement-breakpoint
ALTER TABLE `competitor_digests` ADD `period_start` text;--> statement-breakpoint
ALTER TABLE `competitor_digests` ADD `closed` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `competitor_digests_period_idx` ON `competitor_digests` (`product_id`,`period`,`period_start`);--> statement-breakpoint
ALTER TABLE `competitor_people` ADD `brief` text;--> statement-breakpoint
ALTER TABLE `competitor_people` ADD `briefed_at` integer;--> statement-breakpoint
ALTER TABLE `competitor_posts` ADD `relevance` text;--> statement-breakpoint
ALTER TABLE `competitor_posts` ADD `relevance_why` text;--> statement-breakpoint
-- Digests written before periods were whole weeks: closed, so they show as past weeks and are never rewritten.
UPDATE `competitor_digests` SET `closed` = true;