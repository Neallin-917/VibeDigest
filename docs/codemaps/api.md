# API Codemap

> Freshness: 2025-01-23T22:30:00Z

## Base URL

- **Production**: `https://api.vibedigest.io`
- **Local**: `http://localhost:16080`

## Authentication

All authenticated endpoints require:
```
Authorization: Bearer <supabase_access_token>
```

Token validation: `db_client.validate_token(authorization)` → `user_id`

---

## Endpoints

### Core Video Processing

#### `POST /api/process-video`
Start a new video processing task.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `video_url` | string | ✅ | Video URL (YouTube, etc.) |

**Response** `200`:
```json
{
  "task_id": "uuid",
  "message": "Task started"
}
```

**Errors**:
- `400`: Invalid video URL
- `401`: Missing/Invalid token
- `402`: Quota exceeded

---

#### `POST /api/preview-video`
Get video metadata without processing.

| Field | Type | Required |
|-------|------|----------|
| `url` | string | ✅ |

**Response** `200`:
```json
{
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": 3600,
  "author": "Channel Name",
  "url": "normalized_url",
  "description": "...",
  "upload_date": "20240101",
  "view_count": 12345
}
```

---

#### `POST /api/retry-output`
Retry a failed output.

| Field | Type | Required |
|-------|------|----------|
| `output_id` | string | ✅ |

**Response** `200`:
```json
{ "message": "Retry queued" }
```

---

#### `PATCH /api/tasks/{task_id}`
Update task metadata (title).

**Body**:
```json
{ "video_title": "New Title" }
```

**Response** `200`:
```json
{ "status": "success" }
```

**Errors**:
- `403`: Not authorized (not owner)
- `404`: Task not found

---

### Payments

#### `POST /api/create-checkout-session`
Create Creem payment session.

| Field | Type | Required |
|-------|------|----------|
| `price_id` | string | ✅ |

**Response** `200`:
```json
{ "url": "https://checkout.creem.io/..." }
```

---

#### `POST /api/create-crypto-charge`
Create Coinbase Commerce charge.

| Field | Type | Required |
|-------|------|----------|
| `price_id` | string | ✅ |

**Response** `200`:
```json
{ "url": "https://commerce.coinbase.com/charges/..." }
```

---

### Webhooks

#### `POST /api/webhook/creem`
Creem payment webhook (HMAC-SHA256 signed).

**Headers**:
```
creem-signature: <hmac_signature>
```

**Events Handled**:
- `checkout.completed` → Activate subscription or add credits
- `subscription.paid` → Renew subscription
- `subscription.canceled` → Downgrade to free
- `subscription.expired` → Downgrade to free

---

#### `POST /api/webhook/coinbase`
Coinbase Commerce webhook.

**Headers**:
```
X-CC-Webhook-Signature: <signature>
```

**Events Handled**:
- `charge:confirmed` → Add credits

---

### Utility

#### `GET /`
Health check (public).

**Response**:
```json
{ "status": "VibeDigest API is running", "docs": "/docs" }
```

---

#### `GET /health`
Detailed health check.

**Response**:
```json
{ "status": "healthy", "service": "vibedigest-backend" }
```

---

#### `POST /api/feedback`
Submit user feedback (allows anonymous).

**Body**:
```json
{
  "category": "bug|feature|other",
  "message": "Feedback text",
  "contact_email": "optional@email.com"
}
```

---

## Price IDs (Creem Products)

| Key | Product ID | Amount | Description |
|-----|------------|--------|-------------|
| `CREDIT_PACK` | `prod_5VVI5ldN9dtI7tbHaST5OB` | $5.00 | 50 Credits |
| `PRO_MONTHLY` | `prod_5XoWWMZN6ptDexocrwyqT0` | $9.90 | Pro Monthly |
| `PRO_ANNUAL` | `prod_1pLnYf7AwktcAhRhkjiJTh` | $99.00 | Pro Annual |

---

## Error Codes

| Code | Meaning |
|------|---------|
| `400` | Bad Request (invalid input) |
| `401` | Unauthorized (missing/invalid token) |
| `402` | Payment Required (quota exceeded) |
| `403` | Forbidden (not owner) |
| `404` | Not Found |
| `500` | Internal Server Error |

---

## Frontend API Routes (Next.js)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/process-video` | POST | Proxy to backend |
| `/api/chat` | POST | AI chat (streaming) |
| `/api/chat/threads` | GET/POST | Thread management |
| `/api/chat/threads/[id]/messages` | GET | Message retrieval and invalid-history cleanup |
| `/api/threads` | GET/POST | Thread CRUD |
| `/api/threads/[id]` | GET/PATCH/DELETE | Single thread |
| `/api/image-proxy` | GET | Image proxy for CORS |
