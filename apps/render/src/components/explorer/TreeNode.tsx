import type { VaultFile } from '../../types/vault';

interface TreeNodeProps {
  file: VaultFile;
  depth?: number;
}

export function TreeNode({ file, depth = 0 }: TreeNodeProps) {
  return (
    <div className="tree-node" style={{ paddingLeft: depth * 16 }}>
      <span className={file.isDirectory ? 'folder' : 'file'}>{file.name}</span>
      {file.children?.map((child) => (
        <TreeNode key={child.path} file={child} depth={depth + 1} />
      ))}
    </div>
  );
}
