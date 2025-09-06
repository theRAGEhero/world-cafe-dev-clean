-- Migration 009: Add Session and Table Password Support
-- Adds password functionality for sessions and tables

-- Add admin password to sessions table
ALTER TABLE `sessions` 
ADD COLUMN `admin_password_hash` VARCHAR(255) NULL AFTER `language`,
ADD COLUMN `admin_password` VARCHAR(50) NULL AFTER `admin_password_hash`;

-- Add password support to tables table  
ALTER TABLE `tables`
ADD COLUMN `password_hash` VARCHAR(255) NULL AFTER `qr_code_url`,
ADD COLUMN `password` VARCHAR(50) NULL AFTER `password_hash`,
ADD COLUMN `is_password_protected` BOOLEAN DEFAULT FALSE AFTER `password`;

-- Add indexes for faster password lookups
CREATE INDEX idx_sessions_admin_password ON sessions(admin_password);
CREATE INDEX idx_tables_password ON tables(password);
CREATE INDEX idx_tables_protected ON tables(is_password_protected);