# AGENTS.md

## Project

This repository contains a Chrome Manifest V3 browser extension and a FastAPI backend for voice dictation into web input fields.

The extension will record audio from the user after an explicit user action, send the audio to the backend, and insert the returned transcript into the active field. The backend will call xAI Speech-to-Text and return the transcript to the extension.

## Architecture

- `extension/` contains the browser extension.
- `backend/` contains the FastAPI API server.
- The extension records audio and sends it to the backend.
- The backend calls xAI Speech-to-Text.
- The xAI API key must only exist on the backend.
- The extension must never call xAI directly.

## Technology Stack

- Chrome Extension Manifest V3
- Plain JavaScript
- HTML/CSS
- Python
- FastAPI
- xAI Speech-to-Text API

## MVP Rules

- Keep the MVP simple.
- Do not use Django.
- Do not use React unless explicitly requested.
- Do not add user accounts unless explicitly requested.
- Do not add payments unless explicitly requested.
- Do not add real-time streaming unless explicitly requested.
- Do not add grammar correction unless explicitly requested.
- Do not add Firefox support unless explicitly requested.

## Security and Privacy Rules

- Do not expose API keys in frontend code.
- Do not hardcode secrets.
- Do not record audio automatically.
- Do not record in the background.
- Do not store raw audio by default.
- Do not activate on password fields.
- Do not activate on payment fields.
- Use HTTPS in production.
- Show a visible recording state.
- Allow users to stop recording immediately.
- Keep browser permissions minimal.

## Backend Standards

- Use FastAPI.
- Store secrets in environment variables.
- Keep xAI API logic inside `backend/app/services/xai_service.py`.
- Use clear error handling.
- Validate uploaded file size.
- Validate uploaded file type.
- Return safe error messages.
- Do not store raw audio by default.
- Keep routes thin and move provider logic into services.

## Extension Standards

- Use Manifest V3.
- Use plain JavaScript for the MVP.
- Use content scripts for page interaction.
- Keep permissions minimal.
- Detect supported fields only.
- Ignore password, hidden, disabled, readonly, checkbox, radio, file, and payment fields.
- Dispatch `input` and `change` events after inserting text.
- Restore focus to the active field after inserting text.
- Do not silently request microphone access.

## Supported Fields

Support:

- `input[type="text"]`
- `input[type="search"]`
- `input[type="email"]`
- `input[type="url"]`
- `input[type="tel"]`
- `textarea`
- `[contenteditable="true"]`
- editable ARIA textboxes, such as `[role="textbox"][contenteditable="true"]`

Ignore:

- `input[type="password"]`
- `input[type="file"]`
- `input[type="checkbox"]`
- `input[type="radio"]`
- hidden fields
- readonly fields
- disabled fields
- payment fields
- bare, non-editable `[role="textbox"]` elements

## Development Process

- Work phase by phase.
- Do not build the entire project at once unless explicitly requested.
- Before making large changes, inspect existing files.
- Make the smallest useful change.
- Provide manual testing steps after implementation tasks.

For each future task, Codex should report:

1. Files created or modified.
2. What changed.
3. How to run locally.
4. How to test manually.
5. Known limitations.
6. Recommended next step.

## Initial Phase Order

1. Create project structure.
2. Create Chrome extension skeleton.
3. Detect supported fields and insert fake text.
4. Add microphone button UI.
5. Add audio recording.
6. Create FastAPI backend skeleton.
7. Add `/api/transcribe` with fake response.
8. Connect extension to backend.
9. Add xAI Speech-to-Text integration.
10. Improve UX, privacy, security, and error handling.
