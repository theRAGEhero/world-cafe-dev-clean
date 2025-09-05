-- Migration: Fix recordings table structure
-- Date: 2025-08-27
-- Description: Add missing processed_at column and fix data types in recordings table

-- Add processed_at column for tracking when recording was processed
ALTER TABLE recordings ADD COLUMN processed_at TIMESTAMP NULL;

-- Fix duration_seconds data type to match schema (DECIMAL instead of INT)
ALTER TABLE recordings MODIFY COLUMN duration_seconds DECIMAL(10,2) DEFAULT 0.00;

-- Update NULL values before making columns NOT NULL
UPDATE recordings SET filename = CONCAT('recording_', id, '.mp3') WHERE filename IS NULL;
UPDATE recordings SET file_path = CONCAT('/uploads/', filename) WHERE file_path IS NULL;

-- Fix filename to be NOT NULL and proper length
ALTER TABLE recordings MODIFY COLUMN filename VARCHAR(255) NOT NULL;

-- Fix file_path to be NOT NULL
ALTER TABLE recordings MODIFY COLUMN file_path VARCHAR(500) NOT NULL;

-- Fix status column to be ENUM with proper values
ALTER TABLE recordings MODIFY COLUMN status ENUM('uploaded', 'processing', 'completed', 'failed') DEFAULT 'uploaded';