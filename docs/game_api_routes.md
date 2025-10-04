# Game API Routes

Base URL: `/api/games`

---

## Basic CRUD

### **GET** `/`

Get all games

### **GET** `/:id`

Get game by ID

### **POST** `/`

Create new game
**Request body:**

```json
{
    "title": "New Awesome Game",
    "steam_app_id": 123456,
    "genre": ["Action", "Adventure"],
    "developer": ["Awesome Devs"],
    "publisher": "Awesome Publisher",
    "technologies": ["Awesome Engine"],
    "release_date": "2025-12-01T00:00:00.000Z",
    "description": "The most awesome game ever.",
    "image_url": "new_game.jpg"
}
```

### **PUT** `/:id`

Update game by ID
**Request body:**

```json
{
    "title": "Updated Game Title",
    "publisher": "New Publisher"
}
```

### **DELETE** `/:id`

Delete game by ID

### Search & Statistics

### **GET** `/search`

Search games by query

### **GET** `/stats`

Get overall game statistics

### **GET** `/top`

Get top games

Genre & Category

### **GET** `/genres`

Get available genres

### **GET** `/genre/:genre`

Get games by genre

### **GET** `/category/:category`

Get games by category

Developer

### **GET** `/developers`

Get available developers

### **GET** `/developer/:developer`

Get games by developer

Images

### **GET** `/without-images`

Get games missing images

### **PUT** `/:id/image`

Update a game’s image
**Request body:**

```json
{
    "image_url": "new_cover_image.jpg"
}
```

### **POST** `/bulk-update-images`

Bulk update images
**Request body:**

```json
{
    "updates": [
        { "steam_app_id": 730, "image_url": "cs2_new.jpg" },
        { "steam_app_id": 570, "image_url": "dota2_new.jpg" }
    ]
}
```

AI/LLM

### **POST** `/query`

Query games using LLM
**Request body:**

```json
{
    "gameTitle": "ELDEN RING"
}
```

Import

### **POST** `/import/json`

Import games from JSON body
**Request body:**

```json
{
    "games": [
        {
            "title": "My Imported Game",
            "steamAppId": 987654,
            "genre": ["Indie", "Puzzle"]
        }
    ]
}
```

### **POST** `/import/csv`

Import games from CSV body
**Request body:**

```json
{
    "csvContent": "title,steam_app_id,genre\nMy CSV Game,555444,\"Action,Adventure\""
}
```

### **POST** `/import/csv-file`

Import from uploaded CSV file
**Request body:**

```json
{
    "filePath": "/path/to/your/data.csv"
}
```

### **POST** `/import/custom-csv`

Bulk import custom CSV
