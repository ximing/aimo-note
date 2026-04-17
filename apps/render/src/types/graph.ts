export interface GraphNode {
  id: string;
  label: string;
  type: 'file' | 'folder' | 'tag';
  path?: string;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'link' | '引用';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
