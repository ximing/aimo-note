export interface Graph {
  buildFromNotes(notes: { path: string; body: string }[]): GraphData;
  getBacklinks(path: string): string[];
  getOutlinks(path: string): string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  path: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}
