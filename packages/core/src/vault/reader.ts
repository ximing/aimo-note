import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export async function readNote(vaultPath: string, notePath: string) {
  const fullPath = path.join(vaultPath, notePath);
  const content = await fs.readFile(fullPath, 'utf-8');
  const { data, content: body } = matter(content);
  return { path: notePath, content, frontmatter: data, body };
}
