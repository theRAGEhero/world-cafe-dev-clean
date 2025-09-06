-- Migration 008: Add Table-Level Analysis Support
-- This migration adds support for both table-level and session-level analysis

-- Add new columns to support table-level analysis
ALTER TABLE `session_analyses` 
ADD COLUMN `table_id` INT NULL AFTER `session_id`,
ADD COLUMN `analysis_scope` ENUM('session', 'table') DEFAULT 'session' AFTER `table_id`;

-- Drop the existing unique constraint
ALTER TABLE `session_analyses` 
DROP INDEX `unique_session_analysis`;

-- Add new unique constraint that supports both scopes
ALTER TABLE `session_analyses` 
ADD UNIQUE KEY `unique_analysis_scope` (`session_id`, `table_id`, `analysis_type`, `analysis_scope`);

-- Add foreign key constraint for table_id
ALTER TABLE `session_analyses` 
ADD CONSTRAINT `session_analyses_table_fk` 
FOREIGN KEY (`table_id`) REFERENCES `tables` (`id`) ON DELETE CASCADE;

-- Add indexes for better query performance
ALTER TABLE `session_analyses` 
ADD INDEX `idx_table_analysis` (`table_id`, `analysis_scope`),
ADD INDEX `idx_session_scope` (`session_id`, `analysis_scope`);

-- Update existing analyses to have explicit session scope
UPDATE `session_analyses` 
SET `analysis_scope` = 'session' 
WHERE `analysis_scope` IS NULL OR `analysis_scope` = '';