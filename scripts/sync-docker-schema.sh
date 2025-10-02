#!/bin/bash

# World Café Platform - Docker Schema Sync Script
# This script ensures Docker database schema matches the npm version

set -e

echo "🔄 Starting Docker schema synchronization..."

# Source environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Check if npm database is accessible
echo "📋 Checking npm database connection..."
if ! mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" -e "USE $DB_NAME;" 2>/dev/null; then
    echo "❌ Cannot connect to npm database. Make sure it's running."
    exit 1
fi

# Get list of executed migrations from npm database
echo "📊 Getting migration status from npm database..."
EXECUTED_MIGRATIONS=$(mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$DB_HOST" -P "$DB_PORT" "$DB_NAME" -N -e "SELECT filename FROM migrations ORDER BY id;")

# Update database_schema.sql with current migration list
echo "📝 Updating database_schema.sql with current migrations..."
MIGRATION_INSERT="INSERT INTO \`migrations\` (\`filename\`) VALUES"
MIGRATION_VALUES=""

while IFS= read -r migration; do
    if [ ! -z "$migration" ]; then
        if [ -z "$MIGRATION_VALUES" ]; then
            MIGRATION_VALUES="('$migration')"
        else
            MIGRATION_VALUES="$MIGRATION_VALUES,\n('$migration')"
        fi
    fi
done <<< "$EXECUTED_MIGRATIONS"

# Create updated migration section
FULL_MIGRATION_SECTION="$MIGRATION_INSERT\n$MIGRATION_VALUES;"

# Backup current schema file
cp database_schema.sql database_schema.sql.backup

# Update the migration list in database_schema.sql
sed -i "/INSERT INTO \`migrations\` (\`filename\`) VALUES/,/;/{
    /INSERT INTO \`migrations\` (\`filename\`) VALUES/c\\
$FULL_MIGRATION_SECTION
    /INSERT INTO \`migrations\` (\`filename\`) VALUES/!{
        /;/!d
    }
}" database_schema.sql

echo "✅ Schema synchronization completed!"
echo "📁 Backup saved as database_schema.sql.backup"
echo ""
echo "🐳 To apply changes to Docker:"
echo "   1. docker-compose down --volumes"
echo "   2. docker-compose up -d"
echo ""
echo "⚠️  This will recreate Docker database with updated schema"