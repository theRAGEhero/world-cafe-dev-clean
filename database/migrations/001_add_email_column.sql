-- Migration: Add email and phone columns to participants table
-- Date: 2025-08-27
-- Description: Add email and phone columns to participants table

-- Add email column (will fail silently if already exists)
ALTER TABLE participants ADD COLUMN email VARCHAR(255) NULL AFTER name;

-- Add phone column (will fail silently if already exists)  
ALTER TABLE participants ADD COLUMN phone VARCHAR(20) NULL AFTER email;