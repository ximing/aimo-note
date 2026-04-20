import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export async function writeNote(
  vaultPath: string,
  notePath: string,
  content: string,
  frontmatter?: Record<string, unknown>
) {
  const fullPath = path.join(vaultPath, notePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const fileContent = frontmatter ? matter.stringify(content, frontmatter) : content;
  await fs.writeFile(fullPath, fileContent, 'utf-8');
}
