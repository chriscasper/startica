ALTER TABLE `ai_visibility_answers` ADD `topic` text;--> statement-breakpoint
ALTER TABLE `ai_visibility_answers` ADD `model` text;--> statement-breakpoint
ALTER TABLE `ai_visibility_runs` ADD `models` text DEFAULT '[]' NOT NULL;