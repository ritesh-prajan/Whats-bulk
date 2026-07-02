# WhatsApp Bulk Message Sender Pro

A professional Node.js based bulk messaging engine with Excel integration and intelligent rate limiting.

## Features
- **Excel Integration**: Reads contacts, names, and custom messages from `.xlsx`.
- **Intelligent Rate Limiter**: Random delays (8-20s) and batch pauses (3-5m after 15 messages) to mimic human behavior.
- **Session Persistence**: Uses `LocalAuth` to save your WhatsApp session.
- **Real-time Console**: Dedicated dashboard to track progress and view logs.
- **Status Logging**: Automatically updates the Excel file with `sent`, `failed`, or `not_on_whatsapp`.

## Excel Schema
The `.xlsx` file should have the following columns:
1. `phone_number`: International format (e.g., `+91XXXXXXXXXX`)
2. `name`: Recipient's name (for `{name}` placeholder)
3. `custom_message`: The message body (supports `{name}` placeholder)
4. `status`: Leave empty; the program will write to this column.

## Setup Instructions
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the application:
   ```bash
   npm run dev
   ```
3. Open the application in your browser (default: http://localhost:3000).
4. Scan the QR code with your WhatsApp mobile app.
5. Upload your Excel file.
6. Configure Dry Run or Limits if needed.
7. Click **INITIATE CAMPAIGN**.

## CLI Flags (Supported via Dashboard Config)
- `--dry-run`: Enable via toggle in UI to simulate sends.
- `--limit N`: Set via slider in UI to limit total messages.
- `--file`: Managed via the secure upload interface.

## Error Handling
The system catches individual send failures, logs the reason, and continues to the next recipient. Progress is saved immediately to the Excel file to survive potential crashes.
