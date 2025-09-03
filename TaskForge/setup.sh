#!/bin/bash

# TaskForge Setup Script
# This script creates all necessary directories and helps with initial setup

echo "🚀 TaskForge Setup Script"
echo "========================="

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p backend/src/{models,routes,middleware}
mkdir -p frontend/src/{components,contexts,api,pages}
mkdir -p data

# Create .env file from example if it doesn't exist
if [ ! -f backend/.env ]; then
    echo "📝 Creating .env file..."
    cat > backend/.env << EOF
# Backend Environment Variables
PORT=3001
NODE_ENV=production
DATABASE_PATH=./data/taskforge.db
JWT_SECRET=$(openssl rand -base64 48)
JWT_EXPIRY=7d
FRONTEND_URL=http://localhost
EOF
    echo "✅ Created .env with generated JWT secret"
else
    echo "⚠️  .env file already exists, skipping..."
fi

# Create favicon
echo "🎨 Creating favicon..."
cat > frontend/public/favicon.svg << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#3B82F6">
  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
</svg>
EOF

# Install dependencies with Docker
echo "📦 Installing dependencies..."
docker run --rm -v "$PWD/frontend":/app -w /app node:18-alpine sh -c "npm install"
docker run --rm -v "$PWD/backend":/app -w /app node:18-alpine sh -c "npm install"

# Remove version line from docker-compose.yml if it exists
sed -i '/^version:/d' docker-compose.yml

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Review the JWT_SECRET in backend/.env"
echo "2. Run: docker compose build --no-cache"
echo "3. Run: docker compose up -d"
echo "4. Access TaskForge at http://localhost"
echo ""
echo "The first user to register will automatically become the admin."