#!/bin/bash

# LaneHarbor Development Setup Script
echo "🚀 Setting up LaneHarbor development environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose and try again."
    exit 1
fi

echo "✅ Docker is running"

# Install dependencies for all packages
echo "📦 Installing dependencies..."

# Backend
echo "Installing backend dependencies..."
cd packages/backend && npm install && cd ../..

# Frontend  
echo "Installing frontend dependencies..."
cd packages/frontend && npm install && cd ../..

# Storage
echo "Installing storage dependencies..."
cd packages/storage && npm install && cd ../..

echo "✅ Dependencies installed"

# Build and start services
echo "🏗️ Building and starting services..."
docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service health
echo "🔍 Checking service health..."

# Check MinIO
if curl -s http://localhost:9001 > /dev/null; then
    echo "✅ MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
else
    echo "⚠️  MinIO might not be ready yet"
fi

# Check Backend
if curl -s http://localhost:8787/healthz > /dev/null; then
    echo "✅ Backend API: http://localhost:8787"
else
    echo "⚠️  Backend might not be ready yet"
fi

# Check Frontend
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend: http://localhost:3000"
else
    echo "⚠️  Frontend might not be ready yet"
fi

echo ""
echo "🎉 LaneHarbor development environment is ready!"
echo ""
echo "Services:"
echo "  • Frontend:      http://localhost:3000"
echo "  • Backend API:   http://localhost:8787"
echo "  • Storage gRPC:  localhost:50051"
echo "  • MinIO Console: http://localhost:9001"
echo ""
echo "Useful commands:"
echo "  • View logs:     docker-compose logs -f [service]"
echo "  • Stop all:      docker-compose down"
echo "  • Restart:       docker-compose restart [service]"
echo "  • Shell access:  docker-compose exec [service] sh"
echo ""
echo "Happy coding! 🚀"
