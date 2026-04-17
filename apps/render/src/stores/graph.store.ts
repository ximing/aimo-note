import { Service } from '@rabjs/react';
import type { GraphData } from '../types/graph';

export interface GraphState {
  data: GraphData;
  selectedNode: string | null;
  viewState: { zoom: number; pan: { x: number; y: number } };
}

class GraphStore extends Service<GraphState> {
  protected state: GraphState = {
    data: { nodes: [], edges: [] },
    selectedNode: null,
    viewState: { zoom: 1, pan: { x: 0, y: 0 } },
  };
}

export const graphStore = new GraphStore();
export function useGraphStore() {
  return graphStore.use();
}
