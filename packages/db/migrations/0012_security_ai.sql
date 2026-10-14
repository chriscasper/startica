CREATE TABLE `security_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`product_id` text NOT NULL,
	`reporter` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`received_at` integer NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`triage` text,
	`triage_status` text,
	`triage_error` text,
	`finding_id` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`finding_id`) REFERENCES `security_findings`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `security_reports_product_idx` ON `security_reports` (`product_id`,`status`);--> statement-breakpoint
ALTER TABLE `security_findings` ADD `source` text DEFAULT 'scan' NOT NULL;--> statement-breakpoint
ALTER TABLE `security_findings` ADD `title` text;--> statement-breakpoint
ALTER TABLE `security_findings` ADD `description` text;--> statement-breakpoint
ALTER TABLE `security_findings` ADD `fix` text;--> statement-breakpoint
ALTER TABLE `security_findings` ADD `source_label` text;--> statement-breakpoint
ALTER TABLE `security_findings` ADD `ai_help` text;--> statement-breakpoint
ALTER TABLE `security_findings` ADD `ai_status` text;--> statement-breakpoint
ALTER TABLE `security_findings` ADD `ai_error` text;