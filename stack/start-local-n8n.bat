@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [CAHY CyberWatch] Dang khoi dong may chu n8n Localhost tren http://localhost:5678 ...
docker compose -f docker-compose.local.yml up -d --build
echo [CAHY CyberWatch] Hoan tat! Truy cap n8n Studio tai: http://localhost:5678

