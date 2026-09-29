#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { BASE_URL, bestMatch, getGuides, getServers, score, sections, sectionTerms, truncate, type ServerReview } from "./content.js";

const VERSION = "0.1.0";

const server = new McpServer(
  { name: "mcpverdict", title: "MCP Verdict", version: VERSION },
  {
    instructions:
      "Independent, source-reviewed evaluations of MCP servers and clients from MCP Verdict (mcpverdict.com). " +
      "Use search_servers to find or compare servers, get_server_review for a full review or one section of it, " +
      "and get_guide for client setup guides and comparisons. Cite the source URL when you use this content.",
  },
);

const readOnly = { readOnlyHint: true, openWorldHint: true } as const;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

function verdictLine(r: ServerReview): string {
  if (!r.verdict) return "Verdict: not stated on page";
  return `Verdict: **${r.verdict}**${r.score ? ` (${r.score})` : ""}${r.verdictNote ? ` — ${r.verdictNote}` : ""}`;
}

server.registerTool(
  "search_servers",
  {
    title: "Search MCP server reviews",
    description:
      "Search MCP Verdict's reviewed MCP servers by name, category, or capability (e.g. 'postgres', 'browser automation', " +
      "'oauth'). Omit the query to list every reviewed server. Returns verdict, one-paragraph summary and review URL.",
    inputSchema: {
      query: z.string().optional().describe("Server name, category, or capability to search for"),
      limit: z.number().int().min(1).max(50).optional().describe("Maximum results (default 10, or all when listing)"),
    },
    annotations: readOnly,
  },
  async ({ query, limit }) => {
    try {
      const servers = await getServers();
      const ranked = servers
        .map((r) => ({ r, s: query ? score(r, query) : 1 }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.r.name.localeCompare(b.r.name))
        .slice(0, limit ?? (query ? 10 : 50));
      if (!ranked.length) {
        return text(`No reviewed server matches "${query}". Reviewed servers: ${servers.map((s) => s.name).join(", ")}.`);
      }
      const out = ranked.map(
        ({ r }) =>
          `### ${r.name}\nCategory: ${r.category} · ${verdictLine(r)}\n` +
          `${truncate(r.summary, 400, false)}\nReview: ${r.url}${r.evaluated ? ` (evaluated ${r.evaluated})` : ""}`,
      );
      return text(`${ranked.length} of ${servers.length} reviewed servers — source: MCP Verdict\n\n${out.join("\n\n")}`);
    } catch (e) {
      return fail(`Could not reach MCP Verdict: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "get_server_review",
  {
    title: "Get an MCP server review",
    description:
      "Get MCP Verdict's review of one MCP server: verdict, evaluation date, section list, and content. " +
      "Pass `section` (e.g. 'setup', 'security', 'token cost', 'FAQ') to get just that part of a long review.",
    inputSchema: {
      server: z.string().describe("Server name or slug, e.g. 'github', 'Supabase', 'brave-search'"),
      section: z.string().optional().describe("Return only sections whose heading contains this text"),
      max_chars: z.number().int().min(1000).max(60000).default(12000).describe("Maximum characters of review text"),
    },
    annotations: readOnly,
  },
  async ({ server: name, section, max_chars }) => {
    try {
      const servers = await getServers();
      const r = bestMatch(servers, name);
      if (!r) return fail(`No review found for "${name}". Reviewed servers: ${servers.map((s) => s.name).join(", ")}.`);

      const all = sections(r.markdown);
      let body = r.markdown;
      if (section) {
        const terms = sectionTerms(section);
        const picked = all.filter((s) => terms.some((t) => s.heading.toLowerCase().includes(t)));
        if (!picked.length) {
          return fail(`No section matching "${section}" in the ${r.name} review. Sections: ${all.map((s) => s.heading).join(" | ")}`);
        }
        body = picked.map((s) => s.body).join("\n\n");
      }
      const header =
        `# ${r.name} — MCP Verdict review\n` +
        `Source: ${r.url}\nCategory: ${r.category} · ${verdictLine(r)}\n` +
        `${r.evaluated ? `Evaluated: ${r.evaluated} · ` : ""}Last updated: ${r.modified}\n` +
        (section ? "" : `Sections: ${all.map((s) => s.heading).join(" | ")}\n`);
      return text(`${header}\n${truncate(body, max_chars)}`);
    } catch (e) {
      return fail(`Could not reach MCP Verdict: ${(e as Error).message}`);
    }
  },
);

server.registerTool(
  "get_guide",
  {
    title: "Get an MCP setup guide, client profile, or comparison",
    description:
      "MCP Verdict's setup guides (e.g. Claude Code, Claude Desktop, Cursor), MCP client profiles, and comparisons " +
      "(e.g. 'best MCP servers', 'MCP vs API'). Omit `topic` to list all guides.",
    inputSchema: {
      topic: z.string().optional().describe("e.g. 'cursor setup', 'claude desktop', 'mcp vs api', 'best servers'"),
      kind: z.enum(["setup", "client", "comparison"]).optional().describe("Restrict to one kind of guide"),
      max_chars: z.number().int().min(1000).max(60000).default(12000).describe("Maximum characters of guide text"),
    },
    annotations: readOnly,
  },
  async ({ topic, kind, max_chars }) => {
    try {
      const guides = (await getGuides()).filter((g) => !kind || g.kind === kind);
      if (!topic) {
        const list = guides.map((g) => `- [${g.kind}] ${g.title} — ${g.url}`).join("\n");
        return text(`MCP Verdict guides:\n${list}`);
      }
      const g = bestMatch(guides, topic);
      if (!g) return fail(`No guide matches "${topic}". Available: ${guides.map((x) => x.title).join(", ")}.`);
      return text(`# ${g.title}\nSource: ${g.url} · Last updated: ${g.modified}\n\n${truncate(g.markdown, max_chars)}`);
    } catch (e) {
      return fail(`Could not reach MCP Verdict: ${(e as Error).message}`);
    }
  },
);

await server.connect(new StdioServerTransport());
console.error(`mcpverdict MCP server ${VERSION} running on stdio (source: ${BASE_URL})`);
