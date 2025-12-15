# Building Capacity Monitor - Docker Deployment

## Quick Start

1. **Copy your existing code:**
   ```bash
   # Backend
   cp ~/snmp-capacity-backend/server.js backend/
   cp ~/snmp-capacity-backend/package.json backend/
   
   # Frontend  
   cp -r ~/capacity-dashboard/src frontend/
   cp -r ~/capacity-dashboard/public frontend/
   cp ~/capacity-dashboard/package.json frontend/
   ```

2. **Edit switch configuration:**
   ```bash
   nano backend/sites-config.json
   ```

3. **Start services:**
   ```bash
   ./start.sh
   ```

4. **Access dashboard:**
   - Frontend: http://localhost
   - Backend: http://localhost:3000

## Commands

- `./start.sh` - Start all services
- `./stop.sh` - Stop all services  
- `./restart.sh` - Restart all services
- `./update.sh` - Rebuild and restart
- `./logs.sh` - View logs (add service name: ./logs.sh backend)

## Configuration

Edit `backend/sites-config.json` to configure your switches.
After editing, restart: `docker-compose restart backend`

## Manual Commands

```bash
# Build
docker-compose build

# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
```
# OccupanyTracking
# OccupanyTracking
