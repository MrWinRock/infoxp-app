# User API Routes

Base URL: `/api/users`

---

## Authentication

### **POST** `/register`

Register a new user.
**Request body:**

```json
{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "mypassword123",
    "date_of_birth": "1998-07-15"
}
```

### **POST** `/login`

Authenticate user and return token.
**Request body:**

```json
{
    "email": "john@example.com",
    "password": "mypassword123"
}
```

### Profile

### **GET** `/profile/me`

Get current user profile (auth required)

### **PUT** `/:id/password`

Update user password (auth required)
**Request body:**

```json
{
    "currentPassword": "mypassword123",
    "newPassword": "newstrongpassword456"
}
```

### **PUT** `/:id`

Update user info (name, email, etc.) (auth required)
**Request body:**

```json
{
    "name": "Johnathan Doe",
    "email": "johnathan.doe@example.com",
    "date_of_birth": "1998-07-16"
}
```

### **POST** `/reset-password`

Reset password using token
**Request body:**

```json
{
    "token": "a1b2c3d4e5f6...",
    "newPassword": "brandnewpassword789"
}
```

### Admin

### **GET** `/`

Get all users (admin only)

### **GET** `/:id`

Get user by ID (admin only)

### **DELETE** `/:id`

Delete user (admin only)

### **PUT** `/:id/promote`

Promote user to admin (admin only)
