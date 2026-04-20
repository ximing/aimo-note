import { editorViewCtx } from '@milkdown/kit/core';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model';
import { parseHtmlImageNodeAttrs } from '../extensions/custom-image';

interface Replacement {
  from: number;
  to: number;
  nextNode: ProseMirrorNode;
}

export const migrateHtmlImageNodes = (ctx: Ctx): number => {
  const view = ctx.get(editorViewCtx);
  const htmlNodeType = view.state.schema.nodes.html;
  const imageNodeType = view.state.schema.nodes.image;

  if (!htmlNodeType || !imageNodeType) {
    return 0;
  }

  const replacements: Replacement[] = [];
  view.state.doc.descendants((node, pos) => {
    if (node.type !== htmlNodeType) return;
    const parsed = parseHtmlImageNodeAttrs(String(node.attrs.value || ''));
    if (!parsed) return;

    replacements.push({
      from: pos,
      to: pos + node.nodeSize,
      nextNode: imageNodeType.create(parsed),
    });
  });

  if (replacements.length === 0) {
    return 0;
  }

  const tr = replacements
    .sort((a, b) => b.from - a.from)
    .reduce((transaction, item) => {
      return transaction.replaceWith(item.from, item.to, item.nextNode);
    }, view.state.tr);

  if (!tr.docChanged) {
    return 0;
  }

  view.dispatch(tr);
  return replacements.length;
};
