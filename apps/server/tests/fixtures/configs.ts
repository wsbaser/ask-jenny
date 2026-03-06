/**
 * Configuration fixtures for testing
 */

export const tomlConfigFixture = `
experimental_use_rmcp_client = true

[mcp_servers.ask-jenny-tools]
command = "node"
args = ["/path/to/server.js"]
startup_timeout_sec = 10
tool_timeout_sec = 60
enabled_tools = ["UpdateFeatureStatus"]

[mcp_servers.ask-jenny-tools.env]
ASK_JENNY_PROJECT_PATH = "/path/to/project"
`;
