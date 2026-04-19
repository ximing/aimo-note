# utils/ - Utility Functions

Pure utility functions for the renderer process. No React dependencies.

## File Structure

| File | Purpose |
|------|---------|
| `classNames.ts` | Conditional class name joining |
| `date.ts` | Date formatting utilities |
| `debounce.ts` | Debounce and throttle functions |
| `download.ts` | File download helpers |
| `isElectron.ts` | Electron environment detection + window.electronAPI types |
| `markdown.ts` | Markdown parsing utilities (links, tags, frontmatter) |
| `navigation.ts` | React Router navigation outside components |
| `path.ts` | Path manipulation utilities |
| `request.ts` | Axios instance with auth interceptors |

## Utilities

### classNames.ts

```typescript
classNames('foo', 'bar')           // 'foo bar'
classNames('foo', false && 'bar')  // 'foo'
```

### date.ts

```typescript
formatDate(new Date())        // 'Apr 19, 2026'
formatRelativeDate(date)      // 'Today', 'Yesterday', '3 days ago'
isToday(date)                 // boolean
isYesterday(date)             // boolean
```

### debounce.ts

```typescript
const debouncedFn = debounce(fn, 300);
const throttledFn = throttle(fn, 100);
```

### download.ts

```typescript
downloadFileFromUrl(url, filename)  // Fetch and download
downloadBlob(blob, filename)        // Download blob directly
getFilenameFromUrl(url)             // Extract filename from URL
```

### isElectron.ts

Environment detection:

```typescript
isElectron()     // boolean - running in Electron?
getPlatform()    // 'darwin' | 'win32' | 'linux' | 'browser'
isMacOS()        // boolean
isWindows()      // boolean
isLinux()        // boolean
onFileDrop(cb)   // Register file drop handler, returns cleanup fn
```

**Critical**: This file defines `window.electronAPI` TypeScript interface. When adding new IPC methods, update the interface here.

### markdown.ts

```typescript
parseLinks('[[note1]] and [[note2]]')  // ['note1', 'note2']
parseTags('#tag1 #tag2')                // ['tag1', 'tag2']
extractFrontmatter(content)             // { data: {...}, content: '...' }
```

### navigation.ts

For navigation outside React components (e.g., in services):

```typescript
// In app.tsx
setNavigate(navigate);

// In service/utils
navigate('/auth', { replace: true });
```

### path.ts

```typescript
joinPath('a', 'b', 'c')  // 'a/b/c'
dirname('/a/b/c.md')     // '/a/b'
basename('/a/b/c.md')    // 'c.md'
extname('/a/b/c.md')     // '.md'
normalizePath('a\\b//c') // 'a/b/c'
```

### request.ts

Axios instance with:

- **Auth**: Auto-injects Bearer token in Electron
- **Token caching**: `setElectronToken()`, `clearElectronToken()`
- **Error handling**: 401 redirects to `/auth`
- **Date serialization**: Date objects → timestamps in query params

```typescript
import request from '@/utils/request';

request.get('/api/notes');
request.post('/api/notes', { title: 'New' });
```

## Adding New Utilities

1. Create new file with descriptive name
2. Export pure functions (no side effects preferred)
3. Keep functions small and focused
4. Add JSDoc comments for complex logic
