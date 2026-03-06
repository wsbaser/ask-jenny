#!/bin/sh
set -e

# Ensure Claude CLI config directory exists with correct permissions
if [ ! -d "/home/ask-jenny/.claude" ]; then
    mkdir -p /home/ask-jenny/.claude
fi

# If CLAUDE_OAUTH_CREDENTIALS is set, write it to the credentials file
# This allows passing OAuth tokens from host (especially macOS where they're in Keychain)
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
    echo "$CLAUDE_OAUTH_CREDENTIALS" > /home/ask-jenny/.claude/.credentials.json
    chmod 600 /home/ask-jenny/.claude/.credentials.json
fi

# Fix permissions on Claude CLI config directory
chown -R ask-jenny:ask-jenny /home/ask-jenny/.claude
chmod 700 /home/ask-jenny/.claude

# Ensure Cursor CLI config directory exists with correct permissions
# This handles both: mounted volumes (owned by root) and empty directories
if [ ! -d "/home/ask-jenny/.cursor" ]; then
    mkdir -p /home/ask-jenny/.cursor
fi
chown -R ask-jenny:ask-jenny /home/ask-jenny/.cursor
chmod -R 700 /home/ask-jenny/.cursor

# Ensure OpenCode CLI config directory exists with correct permissions
# OpenCode stores config and auth in ~/.local/share/opencode/
if [ ! -d "/home/ask-jenny/.local/share/opencode" ]; then
    mkdir -p /home/ask-jenny/.local/share/opencode
fi
chown -R ask-jenny:ask-jenny /home/ask-jenny/.local/share/opencode
chmod -R 700 /home/ask-jenny/.local/share/opencode

# OpenCode also uses ~/.config/opencode for configuration
if [ ! -d "/home/ask-jenny/.config/opencode" ]; then
    mkdir -p /home/ask-jenny/.config/opencode
fi
chown -R ask-jenny:ask-jenny /home/ask-jenny/.config/opencode
chmod -R 700 /home/ask-jenny/.config/opencode

# OpenCode also uses ~/.cache/opencode for cache data (version file, etc.)
if [ ! -d "/home/ask-jenny/.cache/opencode" ]; then
    mkdir -p /home/ask-jenny/.cache/opencode
fi
chown -R ask-jenny:ask-jenny /home/ask-jenny/.cache/opencode
chmod -R 700 /home/ask-jenny/.cache/opencode

# Ensure npm cache directory exists with correct permissions
# This is needed for using npx to run MCP servers
if [ ! -d "/home/ask-jenny/.npm" ]; then
    mkdir -p /home/ask-jenny/.npm
fi
chown -R ask-jenny:ask-jenny /home/ask-jenny/.npm

# If CURSOR_AUTH_TOKEN is set, write it to the cursor auth file
# On Linux, cursor-agent uses ~/.config/cursor/auth.json for file-based credential storage
# The env var CURSOR_AUTH_TOKEN is also checked directly by cursor-agent
if [ -n "$CURSOR_AUTH_TOKEN" ]; then
    CURSOR_CONFIG_DIR="/home/ask-jenny/.config/cursor"
    mkdir -p "$CURSOR_CONFIG_DIR"
    # Write auth.json with the access token
    cat > "$CURSOR_CONFIG_DIR/auth.json" << EOF
{
  "accessToken": "$CURSOR_AUTH_TOKEN"
}
EOF
    chmod 600 "$CURSOR_CONFIG_DIR/auth.json"
    chown -R ask-jenny:ask-jenny /home/ask-jenny/.config
fi

# Switch to ask-jenny user and execute the command
exec gosu ask-jenny "$@"
