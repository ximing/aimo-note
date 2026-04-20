import { imageAttr, imageSchema } from '@milkdown/kit/preset/commonmark';

export type ImageAlign = 'left' | 'center' | 'right';

interface PersistedImageState {
  src: string;
  align?: ImageAlign;
  width?: number;
}

const IMAGE_STATE_COMMENT_RE = /\n?<!--\s*aimo-image-state\s+(\[[\s\S]*?\])\s*-->\s*$/;
const HTML_IMG_TAG_RE = /^<img\b[^>]*\/?>(?:<\/img>)?$/i;
const HTML_IMG_ATTR_RE = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const MARKDOWN_IMAGE_RE = /!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)/g;
const IMAGE_WIDTH_STYLE_RE = /(?:^|;)\s*width\s*:\s*(\d+)px\s*(?:;|$)/i;

const escapeHtmlAttr = (value: string): string => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

const decodeHtmlEntity = (value: string): string => {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
};

const normalizeAlign = (value: unknown): ImageAlign => {
  if (value === 'left' || value === 'right' || value === 'center') {
    return value;
  }
  return 'center';
};

const normalizeWidth = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

const parseStyleWidth = (style: string | undefined): number | undefined => {
  if (!style) {
    return undefined;
  }

  const match = style.match(IMAGE_WIDTH_STYLE_RE);
  return normalizeWidth(match?.[1]);
};

const parseHtmlImgAttrs = (html: string): Record<string, string> | null => {
  const tag = html.trim();
  if (!HTML_IMG_TAG_RE.test(tag)) {
    return null;
  }

  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(HTML_IMG_ATTR_RE)) {
    const [, rawName, doubleQuoted, singleQuoted, bareValue] = match;
    if (!rawName) continue;
    const name = rawName.toLowerCase();
    const value = doubleQuoted ?? singleQuoted ?? bareValue ?? '';
    attrs[name] = decodeHtmlEntity(value);
  }

  return attrs;
};

export interface ParsedHtmlImageNodeAttrs {
  src: string;
  alt: string;
  title: string;
  align: ImageAlign;
  width: number | null;
}

export const parseHtmlImageNodeAttrs = (html: string): ParsedHtmlImageNodeAttrs | null => {
  const attrs = parseHtmlImgAttrs(html);
  if (!attrs?.src) {
    return null;
  }

  return {
    src: attrs.src,
    alt: attrs.alt || '',
    title: attrs.title || '',
    align: readAlignFromAttrs(attrs),
    width: parseStyleWidth(attrs.style) ?? normalizeWidth(attrs.width) ?? null,
  };
};

const readAlignFromAttrs = (attrs: Record<string, string>): ImageAlign => {
  if (attrs['data-align']) {
    return normalizeAlign(attrs['data-align']);
  }

  if (attrs.align) {
    return normalizeAlign(attrs.align);
  }

  const className = attrs.class || '';
  if (className.includes('align-left')) return 'left';
  if (className.includes('align-right')) return 'right';
  if (className.includes('align-center')) return 'center';

  return 'center';
};

const buildImageHtml = (attrs: {
  src: string;
  alt: string;
  title: string;
  align: ImageAlign;
  width?: number;
}): string => {
  const htmlAttrs: string[] = [
    `src="${escapeHtmlAttr(attrs.src)}"`,
    `alt="${escapeHtmlAttr(attrs.alt)}"`,
    `class="align-${attrs.align}"`,
    `data-align="${attrs.align}"`,
  ];

  if (attrs.title) {
    htmlAttrs.push(`title="${escapeHtmlAttr(attrs.title)}"`);
  }

  if (typeof attrs.width === 'number') {
    htmlAttrs.push(`width="${attrs.width}"`);
  }

  return `<img ${htmlAttrs.join(' ')}>`;
};

const parsePersistedImageState = (markdown: string): {
  cleanMarkdown: string;
  imageStates: PersistedImageState[];
} => {
  const match = markdown.match(IMAGE_STATE_COMMENT_RE);
  if (!match) {
    return { cleanMarkdown: markdown, imageStates: [] };
  }

  const cleanMarkdown = markdown.replace(IMAGE_STATE_COMMENT_RE, '').trimEnd();

  try {
    const parsed = JSON.parse(match[1]) as PersistedImageState[];
    return {
      cleanMarkdown,
      imageStates: Array.isArray(parsed) ? parsed : [],
    };
  } catch {
    return { cleanMarkdown, imageStates: [] };
  }
};

export const migrateImageStateComment = (markdown: string): string => {
  const { cleanMarkdown, imageStates } = parsePersistedImageState(markdown);
  if (imageStates.length === 0) {
    return cleanMarkdown;
  }

  let stateIndex = 0;

  return cleanMarkdown.replace(MARKDOWN_IMAGE_RE, (fullMatch, alt = '', rawSrc = '', title = '') => {
    const src = String(rawSrc || '').trim();
    const state = imageStates[stateIndex];

    if (!state || state.src !== src) {
      return fullMatch;
    }

    stateIndex += 1;

    const align = normalizeAlign(state.align);
    const width = normalizeWidth(state.width);
    if (align === 'center' && width === undefined) {
      return fullMatch;
    }

    return buildImageHtml({
      src,
      alt: String(alt || ''),
      title: String(title || ''),
      align,
      width,
    });
  });
};

// Extend the built-in imageSchema to add align and width attributes
export const customImageSchema = imageSchema.extendSchema((original) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (ctx: any) => {
    const originalSchema = original(ctx);
    return {
      ...originalSchema,
      attrs: {
        ...originalSchema.attrs,
        align: { default: 'center' },
        width: { default: null },
      },
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom: unknown) => {
            if (!(dom instanceof HTMLElement)) {
              return false;
            }

            return {
              src: dom.getAttribute('src') || '',
              alt: dom.getAttribute('alt') || '',
              title: dom.getAttribute('title') || '',
              align: readAlignFromAttrs({
                class: dom.getAttribute('class') || '',
                align: dom.getAttribute('align') || '',
                'data-align': dom.getAttribute('data-align') || '',
              }),
              width: parseStyleWidth(dom.getAttribute('style') || undefined)
                ?? normalizeWidth(dom.getAttribute('width'))
                ?? null,
            };
          },
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toDOM: (node: any) => {
        const align = normalizeAlign(node.attrs.align);
        const width = normalizeWidth(node.attrs.width);
        return [
          'img',
          {
            ...ctx.get(imageAttr.key)(node),
            src: node.attrs.src,
            alt: node.attrs.alt,
            title: node.attrs.title || undefined,
            class: `align-${align}`,
            'data-align': align,
            width: width ?? undefined,
            style: width ? `width: ${width}px` : undefined,
          },
        ];
      },
      parseMarkdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        match: (node: any) => {
          if (node.type === 'image') {
            return true;
          }

          if (node.type === 'html' && typeof node.value === 'string') {
            return parseHtmlImgAttrs(node.value) !== null;
          }

          return false;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runner: (state: any, node: any, type: any) => {
          if (node.type === 'image') {
            state.addNode(type, {
              src: String(node.url || ''),
              alt: String(node.alt || ''),
              title: String(node.title || ''),
              align: 'center',
              width: null,
            });
            return;
          }

          const attrs = parseHtmlImageNodeAttrs(String(node.value || ''));
          if (!attrs) {
            return;
          }

          state.addNode(type, attrs);
        },
      },
      toMarkdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        match: (node: any) => node.type.name === 'image',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runner: (state: any, node: any) => {
          const src = String(node.attrs.src || '');
          const alt = String(node.attrs.alt || '');
          const title = String(node.attrs.title || '');
          const align = normalizeAlign(node.attrs.align);
          const width = normalizeWidth(node.attrs.width);

          if (align === 'center' && width === undefined) {
            state.addNode('image', undefined, undefined, {
              title,
              url: src,
              alt,
            });
            return;
          }

          state.addNode('html', undefined, buildImageHtml({
            src,
            alt,
            title,
            align,
            width,
          }));
        },
      },
    };
  };
});
