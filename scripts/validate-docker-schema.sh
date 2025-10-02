#!/bin/bash

# World Café Platform - Docker Schema Validation Script  
# This script validates that Docker and npm databases have identical schemas

set -e

echo "🔍 Validating Docker and npm database schemas..."

# Source environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Function to get schema info
get_schema_info() {
    local host=$1
    local port=$2
    local container=$3
    
    if [ "$container" = "docker" ]; then
        docker exec world-cafe-mysql mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "$4" 2>/dev/null
    else
        mysql -u "$DB_USER" -p"$DB_PASSWORD" -h "$host" -P "$port" "$DB_NAME" -e "$4" 2>/dev/null
    fi
}

# Check transcriptions source column
echo "📋 Checking transcriptions.source column..."
NPM_SOURCE=$(get_schema_info "localhost" "3306" "npm" "SHOW COLUMNS FROM transcriptions WHERE Field='source';" | grep source | awk '{print $2}')
DOCKER_SOURCE=$(get_schema_info "" "" "docker" "SHOW COLUMNS FROM transcriptions WHERE Field='source';" | grep source | awk '{print $2}')

echo "   npm:    $NPM_SOURCE"
echo "   docker: $DOCKER_SOURCE"

if [ "$NPM_SOURCE" != "$DOCKER_SOURCE" ]; then
    echo "❌ transcriptions.source column mismatch!"
    exit 1
fi

# Check recordings status column  
echo "📋 Checking recordings.status column..."
NPM_STATUS=$(get_schema_info "localhost" "3306" "npm" "SHOW COLUMNS FROM recordings WHERE Field='status';" | grep status | awk '{print $2}')
DOCKER_STATUS=$(get_schema_info "" "" "docker" "SHOW COLUMNS FROM recordings WHERE Field='status';" | grep status | awk '{print $2}')

echo "   npm:    $NPM_STATUS"
echo "   docker: $DOCKER_STATUS"

if [ "$NPM_STATUS" != "$DOCKER_STATUS" ]; then
    echo "❌ recordings.status column mismatch!"
    exit 1
fi

# Check recordings file_path column nullability
echo "📋 Checking recordings.file_path column..."
NPM_FILE_PATH=$(get_schema_info "localhost" "3306" "npm" "SHOW COLUMNS FROM recordings WHERE Field='file_path';" | grep file_path | awk '{print $3}')
DOCKER_FILE_PATH=$(get_schema_info "" "" "docker" "SHOW COLUMNS FROM recordings WHERE Field='file_path';" | grep file_path | awk '{print $3}')

echo "   npm:    NULL=$NPM_FILE_PATH"
echo "   docker: NULL=$DOCKER_FILE_PATH"

if [ "$NPM_FILE_PATH" != "$DOCKER_FILE_PATH" ]; then
    echo "❌ recordings.file_path column nullability mismatch!"
    exit 1
fi

# Check migration count
echo "📋 Checking migration count..."
NPM_MIGRATIONS=$(get_schema_info "localhost" "3306" "npm" "SELECT COUNT(*) FROM migrations;" | tail -n 1)
DOCKER_MIGRATIONS=$(get_schema_info "" "" "docker" "SELECT COUNT(*) FROM migrations;" | tail -n 1)

echo "   npm:    $NPM_MIGRATIONS migrations"
echo "   docker: $DOCKER_MIGRATIONS migrations"

if [ "$NPM_MIGRATIONS" != "$DOCKER_MIGRATIONS" ]; then
    echo "❌ Migration count mismatch!"
    exit 1
fi

echo "✅ All schema validations passed!"
echo "🎉 Docker and npm databases have identical schemas"