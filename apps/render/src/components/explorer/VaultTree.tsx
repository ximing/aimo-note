import { observer } from '@rabjs/react';
import { useVaultService } from '@/services';
import { TreeNode } from './TreeNode';

export const VaultTree = observer(() => {
  const vaultService = useVaultService();
  const { tree, path } = vaultService;

  if (!path) {
    return (
      <div className="vault-tree p-4 text-center text-muted-foreground">
        No vault open
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="vault-tree p-4 text-center text-muted-foreground">
        Vault is empty
      </div>
    );
  }

  return (
    <div className="vault-tree overflow-auto">
      {tree.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
});
