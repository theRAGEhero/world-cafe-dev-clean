#!/bin/bash

# Export Docker image script
# Run this on your dev server after building

echo "🚀 Exporting World Café Docker image..."

# Get the current image ID
IMAGE_ID=$(docker images world-cafe-dev-clean-app:latest -q)

if [ -z "$IMAGE_ID" ]; then
    echo "❌ Error: world-cafe-dev-clean-app:latest image not found"
    echo "Please build the image first with: docker-compose build"
    exit 1
fi

# Create exports directory
mkdir -p exports

# Export the image
echo "📦 Exporting image $IMAGE_ID..."
docker save world-cafe-dev-clean-app:latest | gzip > exports/world-cafe-platform.tar.gz

# Get file size
FILE_SIZE=$(du -h exports/world-cafe-platform.tar.gz | cut -f1)

echo "✅ Image exported successfully!"
echo "📁 File: exports/world-cafe-platform.tar.gz"
echo "📊 Size: $FILE_SIZE"
echo ""
echo "🚚 To deploy on production server:"
echo "1. Copy exports/world-cafe-platform.tar.gz to your production server"
echo "2. Run: docker load < world-cafe-platform.tar.gz"
echo "3. Tag: docker tag world-cafe-dev-clean-app:latest world-cafe-platform:latest"
echo "4. Deploy: docker-compose -f docker-compose.exported.yml up -d"