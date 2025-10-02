# World Café Platform - Database Schema Management

This directory contains scripts to ensure Docker and npm database schemas stay synchronized automatically.

## Problem Solved

Previously, Docker and npm versions could have different database schemas because:
- Docker uses static `database_schema.sql` file that gets outdated
- npm uses dynamic migration system that auto-discovers new migrations
- No automatic sync mechanism between the two approaches

## Scripts

### `sync-docker-schema.sh`
Synchronizes `database_schema.sql` with the current npm database state.

**Usage:**
```bash
./scripts/sync-docker-schema.sh
```

**What it does:**
- Reads current migration list from npm database
- Updates `database_schema.sql` with correct migration list
- Creates backup of old schema file
- Provides instructions for applying to Docker

### `validate-docker-schema.sh`
Validates that Docker and npm databases have identical schemas.

**Usage:**
```bash
./scripts/validate-docker-schema.sh
```

**What it validates:**
- `transcriptions.source` ENUM values match
- `recordings.status` ENUM values match  
- `recordings.file_path` nullability matches
- Migration count is identical

## Workflow for Schema Changes

### 1. Adding New Migrations
When adding a new migration file:

```bash
# 1. Create migration file
echo "ALTER TABLE ..." > backend/database/migrations/014_new_feature.sql

# 2. Test with npm version
npm start
# Migration auto-applies to npm database

# 3. Sync schema file for Docker
./scripts/sync-docker-schema.sh

# 4. Rebuild Docker with new schema
docker-compose down --volumes
docker-compose up -d

# 5. Validate synchronization
./scripts/validate-docker-schema.sh
```

### 2. Rebuilding Docker from Scratch
The updated `database_schema.sql` now ensures Docker automatically has the correct schema:

```bash
# Clean rebuild with latest schema
docker-compose down --volumes
docker-compose up -d

# Verify schemas match
./scripts/validate-docker-schema.sh
```

### 3. Verifying Current State
To check if schemas are in sync:

```bash
./scripts/validate-docker-schema.sh
```

If schemas are mismatched, run:
```bash
./scripts/sync-docker-schema.sh
# Then rebuild Docker as instructed
```

## Files Modified

- **`database_schema.sql`**: Updated with migration 012 and 013, correct ENUM values
- **`backend/database/migrations/013_update_transcription_source_enum.sql`**: New migration for missing ENUM values
- **`scripts/sync-docker-schema.sh`**: Automation script for schema sync
- **`scripts/validate-docker-schema.sh`**: Validation script for schema consistency

## Benefits

✅ **Automatic synchronization**: Scripts handle schema sync automatically  
✅ **Validation**: Easy verification that both versions match  
✅ **Future-proof**: New migrations automatically included in Docker builds  
✅ **Documentation**: Clear workflow for developers  
✅ **Backup safety**: Schema changes are backed up before modification