#!/bin/bash
echo "Restarting Building Capacity Monitor..."
docker-compose restart
echo "Services restarted."
docker-compose ps
