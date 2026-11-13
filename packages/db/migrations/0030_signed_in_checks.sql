ALTER TABLE `security_occurrences` ADD `signed_in_url` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `signed_in_pages` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `sign_in_url` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `extra_hosts` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `no_scan_windows` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `sites` ADD `signed_in_check` text;