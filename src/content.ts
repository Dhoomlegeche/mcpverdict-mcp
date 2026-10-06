import { NodeHtmlMarkdown } from "node-html-markdown";

export const BASE_URL = (process.env.MCPVERDICT_BASE_URL ?? "https://mcpverdict.com").replace(/\/$/, "");
const USER_AGENT = "mcpverdict-mcp/0.2 (+https://mcpverdict.com)";
const CACHE_TTL_MS = 30 * 60 * 1000;

export type GuideKind = "setup" | "client" | "comparison";

export interface Entry {
  slug: string;
  title: string;
  url: string;
  modified: string;
  excerpt: string;
  markdown: string;
  text: string;
}

export interface ServerReview extends Entry {
  name: string;
  category: string;
  verdict?: string;
  score?: string;
  verdictNote?: string;
  evaluated?: string;
  summary: string;
}

export interface Guide extends Entry {
  kind: GuideKind;
}

interface WpPost {
  slug: string;
  link: string;
  modified_gmt: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
}

const nhm = new NodeHtmlMarkdown({ ignore: ["script", "style", "svg", "button", "form"] });
const cache = new Map<string, { at: number; posts: WpPost[] }>();

async function fetchType(type: string): Promise<WpPost[]> {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.posts;

  const posts: WpPost[] = [];
  for (let page = 1, totalPages = 1; page <= totalPages; page++) {
    const url =
      `${BASE_URL}/wp-json/wp/v2/${type}?per_page=100&page=${page}` +
      `&_fields=slug,link,modified_gmt,title,excerpt,content`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!res.ok) throw new Error(`MCP Verdict returned HTTP ${res.status} for ${type}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      throw new Error("MCP Verdict returned a non-JSON response (possibly a bot challenge). Try again shortly.");
    }
    posts.push(...((await res.json()) as WpPost[]));
    totalPages = Number(res.headers.get("x-wp-totalpages") ?? "1");
  }
  cache.set(type, { at: Date.now(), posts });
  return posts;
}

function decode(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

function htmlToText(html: string): string {
  return decode(html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function toEntry(p: WpPost): Entry {
  // The breadcrumb duplicates navigation the caller already has via the URL.
  const html = p.content.rendered.replace(/<div class="breadcrumb">[\s\S]*?<\/div>/, "");
  return {
    slug: p.slug,
    title: htmlToText(p.title.rendered),
    url: p.link,
    modified: p.modified_gmt.slice(0, 10),
    excerpt: htmlToText(p.excerpt.rendered),
    markdown: nhm
      .translate(html)
      .replace(/(\S)\\\./g, "$1.")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
    text: htmlToText(html),
  };
}

function humanize(slug: string): string {
  const special: Record<string, string> = { ai: "AI", crm: "CRM", devops: "DevOps" };
  return slug
    .split("-")
    .map((w) => special[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "What Does the Postgres MCP Server Do and How Do You Set It Up?" -> "Postgres MCP" */
function shortName(title: string): string {
  if (!title.includes("?")) return title;
  const m = title.match(/the (.+?) MCP Server/i);
  return m ? `${m[1]} MCP` : title;
}

/** First real prose paragraph: skips headings, hero labels and link rows. */
function leadParagraph(markdown: string): string | undefined {
  for (const block of markdown.split(/\n\s*\n/)) {
    const plain = block.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`>#]/g, "").replace(/\s+/g, " ").trim();
    if (/^#/.test(block.trim()) || plain.includes(" · ")) continue;
    if (plain.split(" ").length >= 25) return plain;
  }
  return undefined;
}

const VERDICT_RE =
  /Verdict[\s\S]{0,60}?\b(Not Recommended|Recommended|Conditional)\b(?:\s*·\s*(\d{1,3}\/100))?\s+([^.]{10,400}\.)/;

export async function getServers(): Promise<ServerReview[]> {
  const posts = await fetchType("mcp_server");
  return posts.map((p) => {
    const e = toEntry(p);
    const category = humanize(e.url.match(/\/servers\/([^/]+)\//)?.[1] ?? "uncategorized");
    const v = e.text.match(VERDICT_RE);
    const evaluated =
      e.text.match(/Evaluated (\w+ \d{4})/)?.[1] ?? e.text.match(/Last verified\s+([A-Z][a-z]{2} \d{1,2}, \d{4})/)?.[1];
    return {
      ...e,
      name: shortName(e.title),
      category,
      verdict: v?.[1],
      score: v?.[2],
      verdictNote: v?.[3]?.trim(),
      evaluated,
      summary: leadParagraph(e.markdown) ?? e.excerpt,
    };
  });
}

export async function getGuides(): Promise<Guide[]> {
  const kinds: [string, GuideKind][] = [
    ["mcp_setup", "setup"],
    ["mcp_client", "client"],
    ["mcp_comparison", "comparison"],
  ];
  const all = await Promise.all(kinds.map(async ([type, kind]) => (await fetchType(type)).map((p) => ({ ...toEntry(p), kind }))));
  return all.flat();
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Score how well an entry matches a free-text query. 0 means no match. */
export function score(entry: Entry & { category?: string }, query: string): number {
  const q = norm(query);
  if (!q) return 1;
  const title = norm(`${entry.title} ${(entry as { name?: string }).name ?? ""}`);
  const slug = norm(entry.slug);
  let s = 0;
  if (slug === q || title === q || title === `${q} mcp`) s += 100;
  else if (title.includes(q) || slug.includes(q)) s += 50;
  if (entry.category && norm(entry.category).includes(q)) s += 30;
  const body = norm(entry.text);
  for (const term of q.split(" ").filter((t) => t.length > 2)) {
    if (title.includes(term) || slug.includes(term)) s += 10;
    const hits = body.split(term).length - 1;
    s += Math.min(hits, 10);
  }
  return s;
}

export function bestMatch<T extends Entry>(entries: T[], query: string): T | undefined {
  const ranked = entries.map((e) => ({ e, s: score(e, query) })).sort((a, b) => b.s - a.s);
  return ranked[0] && ranked[0].s >= 10 ? ranked[0].e : undefined;
}

/** Split markdown into sections keyed by their heading. */
export function sections(markdown: string): { heading: string; body: string }[] {
  const parts = markdown.split(/^(?=#{1,3} )/m);
  return parts.map((part) => {
    const m = part.match(/^#{1,3} (.+)\n?/);
    return { heading: m ? m[1].replace(/[*_`]/g, "").trim() : "Introduction", body: part.trim() };
  });
}

export function truncate(s: string, max: number, note = true): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max).replace(/\s+\S*$/, "");
  return note ? `${cut}\n\n…[truncated — request a specific section, or read the full page at the source URL]` : `${cut}…`;
}

const SECTION_SYNONYMS: Record<string, string[]> = {
  security: ["security", "safe", "permission", "risk", "injection", "scope"],
  setup: ["set up", "setup", "install", "config", "connect"],
  cost: ["cost", "token", "pric", "free"],
  tokens: ["token", "cost"],
  faq: ["questions", "faq"],
  auth: ["auth", "token", "oauth", "scope", "key"],
  troubleshooting: ["not working", "error", "fail", "fix", "troubleshoot"],
};

/** Terms that a section heading may contain to match the requested section. */
export function sectionTerms(section: string): string[] {
  const q = section.toLowerCase().trim();
  return SECTION_SYNONYMS[q] ?? [q];
}
