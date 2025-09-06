# Docker Code Synchronization Notes

## CRITICAL: Docker Build Cache Issue

**Problem**: Docker caches layers during builds, which means code changes may not be reflected in the container even after rebuilding.

**Symptoms**:
- Docker version shows different behavior than npm version
- Old code (like removed `max_participants` field) still present in containers
- Database errors about missing/extra columns
- Frontend shows outdated forms/fields

## Solution for Future Deployments

### When Code Changes Are Made:
1. **Always rebuild Docker images without cache**:
   ```bash
   docker-compose down
   docker rmi world-cafe-dev-clean-app  # Remove old image
   docker-compose build --no-cache      # Force rebuild without cache
   docker-compose up -d
   ```

2. **Verify code sync after rebuild**:
   ```bash
   # Check backend code is current
   docker exec world-cafe-app grep -n "max_participants" /app/backend/database/models/Session.js
   
   # Check frontend code is current  
   docker exec world-cafe-app grep -n "Max Participants" /app/public/index.html
   ```

### For Clean Deployments:
1. **Always start with fresh database volumes** when schema changes:
   ```bash
   docker-compose down -v  # Remove volumes
   docker-compose up -d    # Fresh start
   ```

## What to Check Before Migration:

1. **Code Consistency**:
   - [ ] Frontend forms match current codebase (no removed fields)
   - [ ] Backend models match current codebase (no removed columns)
   - [ ] Database schema matches current structure

2. **Database Schema**:
   - [ ] `database_schema.sql` includes ALL current migrations
   - [ ] Table creation order prevents foreign key errors
   - [ ] Column definitions match current code requirements

3. **Environment Variables**:
   - [ ] `.env` file matches docker-compose.yml expectations
   - [ ] Database credentials are consistent

## Remember:
**The Docker version must be an EXACT copy of the working npm version - not a corrected version!**

Any fixes should be made to the source code first, then Docker rebuilt from the fixed source.