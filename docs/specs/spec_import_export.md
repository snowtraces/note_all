# Spec: Note Import/Export Functionality

## Objective
Provide users with robust data ownership and migration capabilities. Users will be able to export all notes (including their attachments, tags, AI summaries, and links) as a single ZIP file containing Markdown files with YAML frontmatter, and import single Markdown files or full ZIP packages back into the application.

## Tech Stack
- Backend: Go 1.25.5, Gin, GORM, SQLite (built-in `archive/zip` for ZIP processing, `gopkg.in/yaml.v3` or standard parser for frontmatter)
- Frontend: React 18, TailwindCSS, Lucide icons

## Endpoints
1. `GET /api/system/export/zip`
   - Description: Exports all notes and attachments in a ZIP archive.
   - Access: Authenticated users.
   - Response: Binary ZIP stream.
2. `POST /api/system/import/zip`
   - Description: Imports a ZIP archive containing Markdown files and attachments.
   - Access: Authenticated users.
   - Request: Multipart form with a `file` field containing the ZIP.
   - Response: JSON summary of imported notes.
3. `POST /api/system/import/md`
   - Description: Imports a single Markdown file.
   - Access: Authenticated users.
   - Request: Multipart form with a `file` field containing the MD.
   - Response: JSON metadata of the imported note.

## Project Structure
- Backend API endpoints will be added to [system.go](file:///d:/code/project/note_all/backend/api/system.go).
- API routes registered in [router.go](file:///d:/code/project/note_all/backend/router/router.go).
- Frontend API helper methods added to [systemApi.js](file:///d:/code/project/note_all/frontend/src/api/systemApi.js).
- Frontend Tab component created at [BackupTab.jsx](file:///d:/code/project/note_all/frontend/src/components/settings/BackupTab.jsx).
- Setup routing in [SettingsModal.jsx](file:///d:/code/project/note_all/frontend/src/components/SettingsModal.jsx).

## Code Style
Go and React components will match the style of existing files.

### Frontmatter Example
```markdown
---
title: "AI generated Title"
tags: [tag1, tag2]
summary: "Note summary description"
created_at: "2026-06-09T10:40:27Z"
original_url: "https://example.com"
is_wiki: false
is_archived: false
---
# Note Content
This is the note body.
```

## Testing Strategy
- Manual testing: Verify zip export creates a readable archive with markdown files and attachments.
- Verify import processes zip and single markdown correctly, extracting frontmatter, saving media, and reconstructing relationships (tags, links).
- Automated tests: We can run unit tests or manual verification scripts if needed.

## Boundaries
- Always: Sanitize file names to avoid directory traversal attacks during ZIP extraction.
- Never: Overwrite existing storage files unless they match exactly or are verified.
- Ask first: Major changes to database schema (none required for this feature).
