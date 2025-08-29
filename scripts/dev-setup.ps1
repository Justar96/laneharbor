# LaneHarbor Development Setup Script for Windows
Write-Host "🚀 Setting up LaneHarbor development environment..." -ForegroundColor Green

# Check if Docker is running
try {
    docker info | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker and try again." -ForegroundColor Red
    exit 1
}

# Check if docker-compose is available
try {
    docker-compose --version | Out-Null
    Write-Host "✅ docker-compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ docker-compose is not installed. Please install docker-compose and try again." -ForegroundColor Red
    exit 1
}

# Install dependencies for all packages
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow

# Backend
Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
Set-Location packages\backend
npm install
Set-Location ..\..

# Frontend  
Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
Set-Location packages\frontend
npm install
Set-Location ..\..

# Storage
Write-Host "Installing storage dependencies..." -ForegroundColor Cyan
Set-Location packages\storage
npm install
Set-Location ..\..

Write-Host "✅ Dependencies installed" -ForegroundColor Green

# Build and start services
Write-Host "🏗️ Building and starting services..." -ForegroundColor Yellow
docker-compose up --build -d

# Wait for services to be ready
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Check service health
Write-Host "🔍 Checking service health..." -ForegroundColor Yellow

# Check MinIO
try {
    Invoke-WebRequest -Uri "http://localhost:9001" -Method Head -TimeoutSec 5 | Out-Null
    Write-Host "✅ MinIO Console: http://localhost:9001 (minioadmin/minioadmin)" -ForegroundColor Green
} catch {
    Write-Host "⚠️  MinIO might not be ready yet" -ForegroundColor Yellow
}

# Check Backend
try {
    Invoke-WebRequest -Uri "http://localhost:8787/healthz" -Method Head -TimeoutSec 5 | Out-Null
    Write-Host "✅ Backend API: http://localhost:8787" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Backend might not be ready yet" -ForegroundColor Yellow
}

# Check Frontend
try {
    Invoke-WebRequest -Uri "http://localhost:3000" -Method Head -TimeoutSec 5 | Out-Null
    Write-Host "✅ Frontend: http://localhost:3000" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Frontend might not be ready yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 LaneHarbor development environment is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Services:" -ForegroundColor Cyan
Write-Host "  • Frontend:      http://localhost:3000" -ForegroundColor White
Write-Host "  • Backend API:   http://localhost:8787" -ForegroundColor White
Write-Host "  • Storage gRPC:  localhost:50051" -ForegroundColor White
Write-Host "  • MinIO Console: http://localhost:9001" -ForegroundColor White
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  • View logs:     docker-compose logs -f [service]" -ForegroundColor White
Write-Host "  • Stop all:      docker-compose down" -ForegroundColor White
Write-Host "  • Restart:       docker-compose restart [service]" -ForegroundColor White
Write-Host "  • Shell access:  docker-compose exec [service] sh" -ForegroundColor White
Write-Host ""
Write-Host "Happy coding! 🚀" -ForegroundColor Green
