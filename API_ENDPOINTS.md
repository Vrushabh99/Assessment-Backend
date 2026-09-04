# Assessment Platform Backend API Endpoints

## Admin Routes - Assignment Candidates

### GET /api/admin/assignments/:assignmentId/candidates

Retrieve all candidates assigned to a specific assignment with their attempt details and current status.

**Authentication Required:** Yes (Admin/Creator role)

**Parameters:**

- `assignmentId` (path, required): The ID of the assignment
- `status` (query, optional): Filter by attempt status - `assigned`, `in_progress`, or `submitted`
- `page` (query, optional, default: 1): Pagination page number
- `limit` (query, optional, default: 50, max: 100): Items per page
- `search` (query, optional): Search candidate by name or email (reserved for future use)

**Response:**

```json
{
  "success": true,
  "message": "Assignment candidates fetched",
  "data": {
    "assignment": {
      "id": "string (ObjectId)",
      "assessmentId": "string (ObjectId)",
      "assessmentTitle": "string",
      "durationMinutes": "number",
      "expiresAt": "ISO 8601 timestamp or null",
      "status": "active | cancelled",
      "createdAt": "ISO 8601 timestamp",
      "updatedAt": "ISO 8601 timestamp"
    },
    "summary": {
      "total": "number (total candidates assigned)",
      "assigned": "number (not yet started)",
      "in_progress": "number (currently taking the test)",
      "submitted": "number (test submitted)",
      "flagged": "number (need review due to violations or auto-submit)"
    },
    "candidates": [
      {
        "attemptId": "string (ObjectId)",
        "candidate": {
          "id": "string (ObjectId)",
          "firstName": "string",
          "lastName": "string",
          "email": "string",
          "fullName": "string"
        },
        "attemptStatus": "assigned | in_progress | submitted",
        "startedAt": "ISO 8601 timestamp or null",
        "submittedAt": "ISO 8601 timestamp or null",
        "scoreObtained": "number or null",
        "totalMarks": "number",
        "isFullyScored": "boolean",
        "autoSubmitted": {
          "reason": "timer_expired | violation_limit_exceeded | null",
          "enabled": "boolean"
        },
        "violations": {
          "total": "number (total violation count)",
          "details": {
            "tab_switch": "number",
            "window_blur": "number",
            "fullscreen_exit": "number",
            "copy": "number",
            "paste": "number",
            "right_click": "number"
          }
        },
        "needsManualReview": "boolean",
        "lastActivityAt": "ISO 8601 timestamp or null"
      }
    ],
    "pagination": {
      "page": "number",
      "limit": "number",
      "total": "number (total candidates)",
      "totalPages": "number"
    }
  }
}
```

**Example Request:**

```bash
# Get all candidates for an assignment
curl -X GET "http://localhost:4000/api/admin/assignments/507f1f77bcf86cd799439011/candidates" \
  -H "Cookie: auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get only candidates who have submitted
curl -X GET "http://localhost:4000/api/admin/assignments/507f1f77bcf86cd799439011/candidates?status=submitted&limit=20&page=1" \
  -H "Cookie: auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Get candidates who are currently taking the test
curl -X GET "http://localhost:4000/api/admin/assignments/507f1f77bcf86cd799439011/candidates?status=in_progress" \
  -H "Cookie: auth=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response Status Codes:**

- `200`: Successfully retrieved candidates list
- `400`: Invalid query parameters or invalid assignment ID format
- `401`: Authentication required
- `404`: Assignment not found

**Use Cases:**

1. **Admin Dashboard**: Display all students assigned to an assessment with their current status
2. **View Attempt**: Get the attempt ID and candidate details needed to open and review a student's attempt
3. **Proctoring Review**: Identify students with violations or auto-submitted attempts that need manual review
4. **Score Management**: See which students have submitted and are awaiting scoring
5. **Reporting**: Generate reports on attempt completion rates and violation patterns

**Notes:**

- The `needsManualReview` flag is `true` if:
  - The attempt was auto-submitted due to timer expiration or violation limits
  - The attempt is not fully scored
  - Proctoring violations were detected
- Candidates are sorted by creation time (oldest assignments first)
- The endpoint is paginated to handle large batches of students
- Total violations count includes all types of detected violations
