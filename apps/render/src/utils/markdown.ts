export function parseLinks(content: string): string[] {
  const regex = /\[\[([^\]]+)\]\]/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    links.push(match[1]);
  }
  return links;
}

export function parseTags(content: string): string[] {
  const regex = /#([a-zA-Z0-9_-]+)/g;
  const tags: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}

export function extractFrontmatter(content: string): {
  data: Record<string, unknown>;
  content: string;
} {
  // Simple frontmatter extraction - use gray-matter in core
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { data: {}, content };
  // Simple parsing - should use gray-matter
  const lines = match[1].split('\n');
  const data: Record<string, unknown> = {};
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length) {
      data[key.trim()] = valueParts.join(':').trim();
    }
  }
  return { data, content: match[2] };
}
