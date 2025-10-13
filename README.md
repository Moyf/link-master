# Link Master

Master your links with this powerful Obsidian plugin! Detects cursor position in links, provides smart navigation, and enhances your link workflow.

## Features

- **Smart Link Detection**: Identifies cursor position in links with precision
  - Wiki links: `[[link text]]` and `[[page|alias]]` 
  - Markdown links: `[text](url)` - focuses on URL detection
- **Alias-aware Navigation**: Detects whether you're in link target or display alias
- **Real-time Feedback**: Console logging with detailed position information
- **Future Features**: Quick navigation, link removal, and beautiful styling (coming soon!)

## How it works

The plugin uses CodeMirror 6's ViewPlugin system to monitor editor state changes. When the cursor moves, it:

1. **Calculates cursor position** (line and column numbers)
2. **Analyzes the surrounding text** using regex patterns to detect links
3. **Determines link context** - whether cursor is inside link text and what type
4. **Logs information** to the browser console with format:
   ```
   Cursor at Line X, Column Y | Inside/Not in link [link details]
   ```

## Development

### Building the plugin

```bash
# Install dependencies
npm install

# Build for development (with file watching)
npm run dev

# Build for production
npm run build
```

### Plugin Structure

- `main.ts` - Main plugin class, handles Obsidian integration
- `src/plugin.ts` - CodeMirror ViewPlugin extension for cursor tracking  
- `src/linkDetector.ts` - Core logic for detecting links and formatting output

## Installation

1. Copy the built plugin files to your Obsidian plugins folder
2. Enable the plugin in Obsidian settings
3. Open browser developer tools (F12) to see console output
4. Move your cursor around in markdown files to see the tracking in action

## Example Output

```text
[Link Master] Cursor at Line 5, Column 12 | Inside Wiki link TARGET: "My Note" (alias: "Display Name")
[Link Master] 🌐 Markdown URL detected: "https://example.com"
[Link Master] 🏷️ Wiki link alias detected: "Display Name" -> "My Note"
[Link Master] Cursor at Line 10, Column 15 | Not in link
```