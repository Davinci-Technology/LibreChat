# LibreChat Fork - Project Documentation

## Project Overview
This is a customized fork of LibreChat with specific modifications for our deployment needs.

## Git Remotes Configuration
- **Origin (Our Fork)**: `https://github.com/Davinci-Technology/LibreChat.git`
- **Upstream (Original Project)**: `https://github.com/danny-avila/LibreChat.git`

### Setting Up Remotes
If you're working on this project on a new workstation, ensure the remotes are configured correctly:

```bash
# Check existing remotes
git remote -v

# Add upstream if not present
git remote add upstream https://github.com/danny-avila/LibreChat.git

# Or update existing upstream URL if needed
git remote set-url upstream https://github.com/danny-avila/LibreChat.git
```

## Our Customizations

### 1. Custom GitHub Workflow
**Location**: `.github/workflows/build-container.yaml`

We replaced all upstream GitHub workflows with a single workflow that:
- Runs daily at 10:00 UTC (3am PST)
- Automatically syncs with upstream changes
- Builds and deploys our Docker container
- Handles merge conflicts by removing upstream workflows automatically

**Important**: We deliberately delete all upstream workflows during merge to avoid conflicts.

### 2. DaVinci Files Plugin
**Location**: Plugin directory (custom plugin)

Our custom plugin for file handling specific to our use case.

### 3. Custom WebSocket Transport with Headers Support
**Location**: `packages/api/src/mcp/WebSocketClientTransportWithHeaders.ts`

We created a custom WebSocket transport class that extends the MCP SDK to support sending headers with WebSocket connections. This is crucial for:
- OAuth authentication with WebSocket-based MCP servers
- Sending authorization tokens in WebSocket headers

The standard MCP SDK's WebSocket client doesn't support headers, so we implemented our own using the `ws` package directly.

**Modified File**: `packages/api/src/mcp/connection.ts`
- Lines 219-261: Custom WebSocket transport implementation
- Imports `WebSocketClientTransportWithHeaders` instead of using the standard SDK transport

## Daily Merge Process

### Automatic Daily Sync
The GitHub workflow automatically attempts to merge upstream changes daily. When it fails due to conflicts, follow these steps:

### Manual Merge Resolution Process

1. **Fetch Latest Changes**
   ```bash
   git fetch upstream
   git fetch origin
   ```

2. **Ensure You're on Main Branch**
   ```bash
   git checkout main
   git pull origin main
   ```

3. **Attempt Merge**
   ```bash
   git merge upstream/main
   ```

4. **Expected Conflicts and Resolutions**

   #### GitHub Workflows Conflict
   - **Conflict**: Any `.github/workflows/*.yml` files from upstream
   - **Resolution**: Delete all upstream workflows except our `build-container.yaml`
   ```bash
   git rm .github/workflows/[conflicting-workflow].yml
   ```

   #### MCP Connection Conflicts
   - **File**: `packages/api/src/mcp/connection.ts`
   - **Common Conflicts**:
     - Import statements: Accept upstream's imports but keep our `WebSocketClientTransportWithHeaders` import
     - Constructor changes: Accept upstream's interface changes (like `MCPConnectionParams`)
     - WebSocket case in `constructTransport()`: Keep our custom implementation (lines 219-261)
   
   **Key Section to Preserve**:
   ```typescript
   case 'websocket': {
     // ... Our custom implementation using WebSocketClientTransportWithHeaders
     const transport = new WebSocketClientTransportWithHeaders(url, {
       headers: Object.keys(headers).length > 0 ? headers : undefined,
     });
     // ... Rest of our custom setup
   }
   ```

5. **After Resolving Conflicts**
   ```bash
   git add .
   git commit -m "Merge upstream/main - preserve custom modifications"
   git push origin main
   ```

## Testing After Merge

- There are no automated tests that we use right now.  We fix merge conflicts as they arise, on push to origin/main github workflow will build and deploy the container.
- Errors will be caught by the staff during testing of the deployed container the following day.

## Important Notes

- **Never accept upstream's WebSocket implementation** in `connection.ts` - always keep our custom `WebSocketClientTransportWithHeaders`
- **Always remove upstream workflows** - we only use our custom `build-container.yaml`

## Troubleshooting

### If WebSocket MCP Servers Stop Working
1. Check that `WebSocketClientTransportWithHeaders.ts` still exists
2. Verify the import in `connection.ts` is correct
3. Ensure the WebSocket case in `constructTransport()` uses our custom class

### If Daily Sync Fails Repeatedly
1. Check for new types of conflicts not covered above
2. Update this documentation with new conflict resolution steps
3. Consider updating the workflow to handle new conflict patterns

