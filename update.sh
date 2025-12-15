#!/bin/bash
echo "Updating Building Capacity Monitor..."
docker-compose down
docker-compose build --no-cache
docker-compose up -d
echo "Update complete!"
docker-compose ps
