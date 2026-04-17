import { useGraph } from '../../hooks/useGraph';

export function GraphPage() {
  const { data, selectedNode } = useGraph();

  return (
    <div className="graph-page h-full flex flex-col">
      <div className="graph-controls border-b p-2 flex items-center gap-2">
        <span className="text-sm">Graph View</span>
        {selectedNode && (
          <span className="text-xs text-gray-500">Selected: {selectedNode}</span>
        )}
      </div>
      <div className="graph-canvas flex-1">
        <div className="text-center text-gray-400 mt-8">
          {data.nodes.length === 0
            ? 'No notes yet. Open a vault to see the graph.'
            : `Graph: ${data.nodes.length} nodes, ${data.edges.length} edges`}
        </div>
      </div>
    </div>
  );
}
