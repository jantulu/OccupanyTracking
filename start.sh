#!/bin/bash
echo "Starting Building Capacity Monitor..."
docker-compose up -d --build
echo ""
docker-compose ps
echo ""
echo "Frontend: http://localhost"
echo "Backend:  http://localhost:3000"
echo ""
echo "View logs: docker-compose logs -f"
