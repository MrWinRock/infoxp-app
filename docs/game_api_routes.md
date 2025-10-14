# Game API Routes

Base URL: `/api/games`

All responses now use the Steam-like JSON format with fields like `Name`, `AppID`, `Developers`, `Publishers`, `Genres`, etc.

---

## Steam-like Format Reference

All game objects follow this structure:

```typescript
{
  AppID: number;                    // Steam App ID
  Name: string;                     // Game title
  "Release date"?: number;          // Unix timestamp (ms)
  "Required age"?: number;          // Minimum age requirement
  "About the game"?: string;        // Game description
  "Header image"?: string;          // Full URL to header image
  Windows?: boolean;                // Windows support
  Mac?: boolean;                    // Mac support
  Linux?: boolean;                  // Linux support
  Developers?: string[];            // Array of developer names
  Publishers?: string | string[];   // Publisher name(s)
  Categories?: string[];            // Steam categories
  Genres?: string[];                // Game genres
}
```

---

## Basic CRUD

### **GET** `/`

Get all games with pagination

**Query parameters:**

- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response:**

```json
{
  "games": [
    {
      "AppID": 1172470,
      "Name": "Apex Legends™",
      "Release date": 1604448000000,
      "Required age": 0,
      "About the game": "Conquer with character...",
      "Header image": "https://cdn.akamai.steamstatic.com/steam/apps/1172470/header.jpg",
      "Windows": true,
      "Mac": false,
      "Linux": false,
      "Developers": ["Respawn Entertainment"],
      "Publishers": "Electronic Arts",
      "Categories": ["Multi-player", "PvP", "Online PvP"],
      "Genres": ["Action", "Adventure", "Free to Play"]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "pages": 8
  }
}
```

### **GET** `/:id`

Get game by MongoDB ID

**Response:** Single game object in Steam format

### **POST** `/`

Create new game

**Request body (Steam format):**

```json
{
  "AppID": 123456,
  "Name": "New Awesome Game",
  "Release date": 1733011200000,
  "Required age": 0,
  "About the game": "The most awesome game ever.",
  "Header image": "https://example.com/header.jpg",
  "Windows": true,
  "Mac": false,
  "Linux": false,
  "Developers": ["Awesome Devs"],
  "Publishers": "Awesome Publisher",
  "Categories": ["Single-player", "Steam Achievements"],
  "Genres": ["Action", "Adventure"]
}
```

**Response:** Created game in Steam format (201)

### **PUT** `/:id`

Update game by MongoDB ID

**Request body (partial Steam format):**

```json
{
  "Name": "Updated Game Title",
  "Publishers": "New Publisher",
  "Header image": "https://example.com/new_header.jpg"
}
```

**Response:** Updated game in Steam format

### **DELETE** `/:id`

Delete game by MongoDB ID

**Response:**

```json
{
  "message": "Game deleted successfully"
}
```

---

## Search & Statistics

### **GET** `/search`

Search games by query

**Query parameters:**

- `q` (optional): Search term (searches title and description)
- `genre` (optional): Filter by genre
- `developer` (optional): Filter by developer
- `category` (optional): Filter by category

**Response:** Array of games in Steam format

### **GET** `/stats`

Get overall game statistics

**Response:**

```json
{
  "total": 150,
  "genreCounts": [
    { "_id": "Action", "count": 45 },
    { "_id": "Adventure", "count": 32 }
  ],
  "topDevelopers": [
    { "_id": "Valve", "count": 12 },
    { "_id": "Epic Games", "count": 8 }
  ]
}
```

### **GET** `/top`

Get top games (most recently added)

**Query parameters:**

- `limit` (optional): Number of games to return (default: 10)

**Response:** Array of games in Steam format

---

## Genre & Category

### **GET** `/genres`

Get all available genres

**Response:**

```json
["Action", "Adventure", "RPG", "Strategy"]
```

### **GET** `/genre/:genre`

Get games by genre

**Response:** Array of games in Steam format

### **GET** `/category/:category`

Get games by category

**Example:** `/api/games/category/Multi-player`

**Response:** Array of games in Steam format

---

## Developer

### **GET** `/developers`

Get all available developers

**Response:**

```json
["Valve", "Epic Games", "Respawn Entertainment"]
```

### **GET** `/developer/:developer`

Get games by developer

**Response:** Array of games in Steam format

---

## Images

### **GET** `/without-images`

Get games missing header images

**Response:** Array of games in Steam format with missing or empty `Header image` field

### **PUT** `/:id/image`

Update a game's header image

**Request body:**

```json
{
  "image_url": "https://example.com/new_cover.jpg"
}
```

**Response:** Updated game in Steam format

### **POST** `/bulk-update-images`

Bulk update header images

**Request body:**

```json
[
  { "id": "507f1f77bcf86cd799439011", "image_url": "https://example.com/img1.jpg" },
  { "id": "507f191e810c19729de860ea", "image_url": "https://example.com/img2.jpg" }
]
```

**Response:**

```json
{
  "success": 2,
  "errors": []
}
```

---

## AI/LLM

### **POST** `/query`

Query games using LLM (streaming response)

**Request body:**

```json
{
  "query": "What are the best multiplayer games?"
}
```

**Response:** Streaming text/plain response from LLM

---

## Import

### **POST** `/import/json`

Import games from JSON array (Steam format)

**Request body:**

```json
[
  {
    "AppID": 987654,
    "Name": "My Imported Game",
    "Genres": ["Indie", "Puzzle"],
    "Developers": ["Indie Studio"],
    "Publishers": "Self-published",
    "Windows": true,
    "Mac": true,
    "Linux": false
  }
]
```

**Response:**

```json
{
  "success": 1,
  "errors": [],
  "duplicates": 0,
  "savedIds": ["507f1f77bcf86cd799439011"]
}
```

### **POST** `/import/csv`

❌ Not implemented (returns 501)

CSV import is deprecated. Use `/import/json` with Steam-like format instead.

### **POST** `/import/csv-file`

❌ Not implemented (returns 501)

CSV file import is deprecated. Use `/import/json` with Steam-like format instead.

### **POST** `/import/custom-csv`

❌ Not implemented (returns 501)

Custom CSV import is deprecated. Use `/import/json` with Steam-like format instead.
