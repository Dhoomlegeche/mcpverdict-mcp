# MCP Verdict MCP Server

[![npm](https://img.shields.io/npm/v/mcpverdict-mcp)](https://www.npmjs.com/package/mcpverdict-mcp) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=mcpverdict&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcHZlcmRpY3QtbWNwIl19)

Ask your AI assistant which MCP server to use, and get an answer that comes from an evaluation instead of a guess.

This server gives Claude, Cursor, and any other MCP client access to [MCP Verdict](https://mcpverdict.com): independent, source-reviewed evaluations of MCP servers, client profiles, and setup guides. Reviews cover capabilities, setup, permissions and security, token costs, and maintenance status, with a verdict where one has been published.

Content is fetched live from [mcpverdict.com](https://mcpverdict.com), so answers match the current published reviews. No API key needed.

## Tools

| Tool | What it does |
|---|---|
| `search_servers` | Find reviewed MCP servers by name, category, or capability (`"postgres"`, `"browser automation"`, `"oauth"`). Omit the query to list all. |
| `get_server_review` | Full review of one server, or one section of it: `section: "security"`, `"setup"`, `"cost"`, `"faq"`, `"troubleshooting"`. |
| `compare_servers` | Side-by-side comparison of 2–4 servers: verdict, evaluation date, summary, security and token-cost notes (`["playwright", "puppeteer"]`). |
| `best_servers` | Reviewed servers for a category or use case, best verdict first (`"database"`, `"browser automation"`). Omit the category to list all categories. |
| `get_guide` | Setup guides (Claude Code, Claude Desktop, Cursor), client profiles, and comparisons such as [best MCP servers](https://mcpverdict.com/mcp/compare/best-mcp-servers/) and [MCP vs API](https://mcpverdict.com/mcp/compare/mcp-vs-api/). |

Example prompts:
- "Is the Puppeteer MCP server still safe to use?"
- "Compare the Postgres and Supabase MCP servers for a production database."
- "What's the best reviewed MCP server for browser automation?"
- "What token scopes does the GitHub MCP server need?"
- "How do I add an MCP server to Cursor?"

## Install

Requires Node.js 18 or newer.

**Claude Code**

```bash
claude mcp add mcpverdict -- npx -y mcpverdict-mcp
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcpverdict": {
      "command": "npx",
      "args": ["-y", "mcpverdict-mcp"]
    }
  }
}
```

**Cursor** — add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project):

```json
{
  "mcpServers": {
    "mcpverdict": {
      "command": "npx",
      "args": ["-y", "mcpverdict-mcp"]
    }
  }
}
```

**VS Code** (GitHub Copilot agent mode):

```bash
code --add-mcp '{"name":"mcpverdict","command":"npx","args":["-y","mcpverdict-mcp"]}'
```

**Windsurf, Cline and other clients** use the same `npx -y mcpverdict-mcp` command.

Setup for other clients: [MCP setup guides](https://mcpverdict.com/mcp/setup/).

## How reviews are made

Reviews are researched from official documentation, repositories, release notes, and disclosed external measurements. See the [methodology](https://mcpverdict.com/methodology/) and [editorial independence](https://mcpverdict.com/editorial-independence/) policy. Found an error? [Corrections](https://mcpverdict.com/corrections/).

## Development

```bash
npm install
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

Set `MCPVERDICT_BASE_URL` to point at another copy of the site (for example a staging install).

## License

MIT. Review content © MCP Verdict; please link to the source page when quoting it.
