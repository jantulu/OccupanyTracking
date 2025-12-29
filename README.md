# Building Capacity Monitor - Docker Deployment

## Quick Start



1. **Edit switch configuration:**
   ```bash
   nano backend/sites-config.json
   ```

2. **Start services:**
   ```bash
   ./start.sh
   ```

3. **Access dashboard:**
   - Frontend: http://localhost
   - Backend: http://localhost:3000 *backend isn't directly accessible*

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