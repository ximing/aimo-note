const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;
const TAG_REGEX = /#([a-zA-Z0-9_-]+)/g;

export function extractLinks(body: string): string[] {
  const links: string[] = [];
  let match;
  while ((match = WIKI_LINK_REGEX.exec(body)) !== null) {
    links.push(match[1]);
  }
  return links;
}

export function extractTags(body: string): string[] {
  const tags: string[] = [];
  let match;
  while ((match = TAG_REGEX.exec(body)) !== null) {
    tags.push(match[1]);
  }
  return tags;
}
