# AI Knowledge Graph — Development Setup Script

Write-Host "=== AI Knowledge Graph Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
$nodeVersion = node --version
$flutterVersion = flutter --version 2>$null | Select-String -Pattern "Flutter"

Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
Write-Host "Flutter: $($flutterVersion -replace '\s+', ' ')" -ForegroundColor Green
Write-Host ""

# Backend setup
Write-Host "--- Setting up Backend ---" -ForegroundColor Yellow
Set-Location backend
npm install
npx prisma generate
Write-Host "Backend dependencies installed" -ForegroundColor Green

# Frontend setup
Write-Host "--- Setting up Frontend ---" -ForegroundColor Yellow
Set-Location ../frontend
flutter pub get
Write-Host "Frontend dependencies installed" -ForegroundColor Green

Set-Location ..

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start development:" -ForegroundColor White
Write-Host "  docker-compose -f docker/docker-compose.yml up -d (start infrastructure)"
Write-Host "  cd backend && npm run start:dev (start backend)"
Write-Host "  cd frontend && flutter run -d chrome (start frontend)"
Write-Host ""
Write-Host "API Docs: http://localhost:3000/api/v1/docs"
