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

### 1. Jenkins CI/CD Pipeline
**Location**: `Jenkinsfile` (project root)

We use a Jenkinsfile (declarative pipeline) for CI/CD, triggered by:
- **Daily cron** at 10:00 UTC (3am PST) — runs upstream sync + build + deploy
- **GitHub webhook** on push to `main` — runs build + deploy (skips sync)
- **Manual trigger** with parameters:
  - `SYNC_ONLY`: Only sync with upstream (no build/deploy)
  - `SKIP_SYNC`: Skip upstream sync (build/deploy only)

The pipeline has three stages:
1. **Sync Upstream**: Fetches and merges upstream changes with automatic conflict resolution, then pushes to origin
2. **Build**: Docker build, tag, and push to our Azure Container Registry
3. **Deploy**: Kubectl rollout restart on AKS

**Jenkins Credentials Required**:
| Credential ID | Type | Content |
|---|---|---|
| `registry-hostname` | Secret text | `davinciai.azurecr.io` |
| `registry-credentials` | Username/password | Registry username + token |
| `kubeconfig` | Secret file | Kubernetes config for AKS |
| `github-ssh-key` | SSH key | For pushing to `Davinci-Technology/LibreChat` |

**Important**: We deliberately delete all upstream GitHub Actions workflows during merge to avoid conflicts.

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
The Jenkinsfile pipeline automatically attempts to merge upstream changes daily (via cron trigger). When it fails due to conflicts, follow these steps:

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
   - **Resolution**: Delete all upstream workflows
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

   #### packages/api/package.json Conflicts
   - **File**: `packages/api/package.json`
   - **Conflict**: Upstream removes `ws` and `@types/ws` dependencies, but we need them for `WebSocketClientTransportWithHeaders`
   - **Resolution**: Keep our version (has `ws` in peerDependencies and `@types/ws` in devDependencies), then manually incorporate upstream's version bumps if desired

5. **After Resolving Conflicts**
   ```bash
   git add .
   git commit -m "Merge upstream/main - preserve custom modifications"
   git push origin main
   ```

## Testing After Merge

- There are no automated tests that we use right now. We fix merge conflicts as they arise, on push to origin/main the Jenkins pipeline will build and deploy the container.
- Errors will be caught by the staff during testing of the deployed container the following day.

## Important Notes

- **Never accept upstream's WebSocket implementation** in `connection.ts` - always keep our custom `WebSocketClientTransportWithHeaders`
- **Always remove upstream workflows** - we have no GitHub Actions workflows of our own; CI/CD is handled by the Jenkinsfile
- **Never accept upstream's Jenkinsfile changes** - the Jenkinsfile is in the "keep ours" list during merge conflict resolution

## Troubleshooting

### If WebSocket MCP Servers Stop Working
1. Check that `WebSocketClientTransportWithHeaders.ts` still exists
2. Verify the import in `connection.ts` is correct
3. Ensure the WebSocket case in `constructTransport()` uses our custom class

### If Daily Sync Fails Repeatedly
1. Check Jenkins build logs for the specific merge conflict
2. Check for new types of conflicts not covered above
3. Update this documentation with new conflict resolution steps
4. Consider updating the Jenkinsfile to handle new conflict patterns

### If Jenkins Pipeline Fails
1. Verify the four credentials are configured in Jenkins (`registry-hostname`, `registry-credentials`, `kubeconfig`, `github-ssh-key`)
2. Ensure the Jenkins GitHub plugin is installed for webhook triggers
3. Check that Docker is available on the Jenkins agent
4. Verify kubectl is installed on the Jenkins agent
