# TaskForge - Self-Hosted Task Management System

## 🚀 Overview

TaskForge is a complete, production-ready task management application designed for teams. It's fully self-hosted, containerized, and can be deployed with a single command.

### Key Features

- **Multi-user Support**: Role-based access control (Admin, Manager, Member)
- **Project Management**: Create and manage multiple projects
- **Task Tracking**: Full task lifecycle with priorities and assignments
- **Real-time Updates**: JWT-based authentication with token refresh
- **Zero Configuration**: SQLite database requires no setup
- **Docker Deployment**: One-command deployment with Docker Compose
- **Modern UI**: React-based SPA with Tailwind CSS

## 📋 Prerequisites

- Linux server (Ubuntu 20.04+ recommended)
- Docker Engine (20.10+)
- Docker Compose (2.0+)
- 1GB RAM minimum
- 2GB disk space

## 🛠️ Quick Start

### 1. Clone or Create the Project Structure

```bash
# Create project directory
mkdir TaskForge && cd TaskForge

# Create the directory structure
mkdir -p backend/src/{models,routes,middleware}
mkdir -p frontend/src/{components,contexts,api,pages}
mkdir -p data
```

### 2. Copy All Files

Copy all the provided files into their respective directories as shown in the project structure.

### 3. Set Environment Variables

```bash
# Create .env file in the backend directory
cp backend/.env.example backend/.env

# Edit the .env file and set a secure JWT secret
nano backend/.env
```

**Important**: Change the `JWT_SECRET` to a secure random string:
```env
JWT_SECRET=your-super-secret-key-change-this-in-production
```

### 4. Deploy with Docker Compose

```bash
# Build and start all services
docker-compose up -d

# Check if services are running
docker-compose ps

# View logs
docker-compose logs -f
```

### 5. Access the Application

Open your browser and navigate to:
- **Application**: http://your-server-ip
- **API Health Check**: http://your-server-ip:3001/api/health

**First User Registration**: The first user to register becomes the admin automatically.

## 📁 Project Structure

```
TaskForge/
├── backend/
│   ├── src/
│   │   ├── models/
│   │   │   └── database.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── projects.js
│   │   │   ├── tasks.js
│   │   │   └── users.js
│   │   ├── middleware/
│   │   │   └── auth.js
│   │   └── app.js
│   ├── .env
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── axios.js
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   └── LoadingSpinner.jsx
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── Projects.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── nginx.conf
│   └── Dockerfile
├── data/               # SQLite database (auto-created)
└── docker-compose.yml
```

## 🔧 Configuration

### Backend Configuration

Edit `backend/.env`:

```env
PORT=3001
NODE_ENV=production
DATABASE_PATH=./data/taskforge.db
JWT_SECRET=change-this-to-a-secure-secret
JWT_EXPIRY=7d
FRONTEND_URL=http://localhost
```

### Frontend Configuration

The frontend is configured via build arguments in Docker Compose. To change the API URL, edit `docker-compose.yml`:

```yaml
frontend:
  build:
    args:
      - VITE_API_URL=http://your-backend-url:3001/api
```

## 🔐 Security Considerations

1. **Change the JWT Secret**: Always use a strong, unique JWT secret in production
2. **Use HTTPS**: Configure SSL/TLS with a reverse proxy (nginx/traefik)
3. **Firewall**: Only expose necessary ports (80/443)
4. **Regular Backups**: Backup the `data/` directory regularly
5. **Update Dependencies**: Keep Docker images and dependencies updated

### Generate a Secure JWT Secret

```bash
# Generate a 64-character random string
openssl rand -base64 48
```

## 🔄 Maintenance

### Backup Database

```bash
# Backup SQLite database
docker-compose exec backend sqlite3 /app/data/taskforge.db ".backup /app/data/backup.db"

# Copy backup to host
docker cp taskforge-backend:/app/data/backup.db ./backups/taskforge_$(date +%Y%m%d).db
```

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart services
docker-compose down
docker-compose up -d --build
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Reset Database (Development Only)

```bash
# Stop services
docker-compose down

# Remove database
rm -rf data/taskforge.db

# Restart services (database will be recreated)
docker-compose up -d
```

## 🚀 Production Deployment

### Using Nginx with SSL

1. Install Certbot and obtain SSL certificate:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

2. Update `docker-compose.yml` to use port 8080 for frontend
3. Configure nginx as reverse proxy

### Using Traefik (Alternative)

Add Traefik labels to `docker-compose.yml`:

```yaml
services:
  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.taskforge.rule=Host(`yourdomain.com`)"
      - "traefik.http.routers.taskforge.tls=true"
      - "traefik.http.routers.taskforge.tls.certresolver=letsencrypt"
```

## 📊 API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/change-password` - Change password
- `POST /api/auth/logout` - Logout

### Project Endpoints

- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/members` - Add member
- `DELETE /api/projects/:id/members/:userId` - Remove member

### Task Endpoints

- `GET /api/tasks` - List tasks with filters
- `POST /api/tasks` - Create task
- `GET /api/tasks/:id` - Get task details
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/comments` - Add comment

## 🐛 Troubleshooting

### Services won't start

```bash
# Check logs
docker-compose logs

# Verify ports are available
sudo netstat -tulpn | grep -E ':(80|3001)'
```

### Database locked error

```bash
# Restart backend service
docker-compose restart backend
```

### Can't access the application

1. Check firewall rules
2. Verify Docker is running: `docker ps`
3. Check service health: `docker-compose ps`
4. Review logs: `docker-compose logs -f`

## 📝 License

This project is provided as-is for deployment and customization.

## 🤝 Support

For issues, feature requests, or questions:
1. Check the logs first
2. Verify all environment variables are set correctly
3. Ensure Docker and Docker Compose are up to date
4. Test with the default configuration before customizing

---


**Built with modern technologies**: Node.js, Express, React, SQLite, Docker, Tailwind CSS
