-- Migration: Add missing columns to tables table
-- Date: 2025-08-27
-- Description: Add facilitator_id and other missing columns to tables table

-- Add facilitator_id column to track table facilitator
ALTER TABLE tables ADD COLUMN facilitator_id VARCHAR(36) NULL;

-- Add current_topic column for topic tracking
ALTER TABLE tables ADD COLUMN current_topic VARCHAR(500) NULL;

-- Add qr_code_url column for individual table QR codes
ALTER TABLE tables ADD COLUMN qr_code_url VARCHAR(500) NULL;

-- Add foreign key constraint for facilitator_id
ALTER TABLE tables ADD CONSTRAINT tables_facilitator_fk 
FOREIGN KEY (facilitator_id) REFERENCES participants(id) ON DELETE SET NULL;