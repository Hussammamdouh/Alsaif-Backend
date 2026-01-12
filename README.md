# Stock Insights Backend

Production-ready backend for Stock Insights mobile application with JWT authentication and role-based authorization.

## Tech Stack

- Node.js + Express.js
- MongoDB + Mongoose
- JWT Authentication
- bcryptjs for password hashing
- Jest + Supertest for testing

## Project Structure

```
/backend
├── /src
│   ├── /config          # Database and environment config
│   ├── /models          # Mongoose schemas
│   ├── /controllers     # Request handlers
│   ├── /services        # Business logic
│   ├── /middleware      # Auth, error handling
│   ├── /routes          # API routes
│   ├── /utils           # Helper functions
│   └── app.js           # Express app
├── /tests               # Jest tests
├── server.js            # Entry point
└── package.json
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration.

3. **Start server:**
   ```bash
   npm start          # Production
   npm run dev        # Development with nodemon
   ```

4. **Run tests:**
   ```bash
   npm test           # Run all tests with coverage
   npm run test:watch # Watch mode
   ```

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Access | Description |
|--------|----------|--------|-------------|
| POST | `/register` | Public | Register new user (role: user) |
| POST | `/login` | Public | Login (all roles) |
| GET | `/me` | Protected | Get current user info |

### Admin Routes (`/api/admin`)

*Accessible by: admin, superadmin*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | Get all users |
| PATCH | `/users/:userId/status` | Activate/deactivate user |
| GET | `/dashboard` | Get dashboard stats |

### Superadmin Routes (`/api/superadmin`)

*Accessible by: superadmin only*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admins` | Create new admin |
| PATCH | `/users/:userId/role` | Update user role |
| DELETE | `/users/:userId` | Delete user (except superadmin) |
| GET | `/system` | Get system configuration |

## User Roles

1. **user**: Normal users, can register and access free content
2. **admin**: Manage content and users
3. **superadmin**: Full system access

## Authentication Flow

1. Register/Login → Receive JWT token
2. Include token in requests: `Authorization: Bearer <token>`
3. Token contains user ID and role
4. Middleware validates token and checks role permissions

## Testing

Tests use MongoDB Memory Server for isolation:

```bash
npm test
```

Test coverage includes:
- User registration and validation
- Login with various scenarios
- JWT generation and verification
- Role-based access control
- Model validation

## Security Features

- Password hashing with bcrypt
- JWT with expiration
- Role-based authorization
- Environment-based secrets
- Centralized error handling
- Input validation

## Future Extensions

This architecture supports:
- Premium content management
- Payment integration
- Real-time chat
- Stock insights CRUD
- Notification system

## Environment Variables

```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/stock-insights
JWT_SECRET=your_secret_key
JWT_EXPIRE=7d
```

## Error Handling

All errors return consistent format:

```json
{
  "success": false,
  "message": "Error description"
}
```

Status codes:
- 200: Success
- 201: Created
- 400: Bad request
- 401: Unauthorized (authentication failed)
- 403: Forbidden (insufficient permissions)
- 404: Not found
- 500: Server error
This Readme was updated on 12/01/2026