import type { GraphData } from '../types/graph';

export interface Graph {
  getGraphData(): Promise<GraphData>;
  getBacklinks(path: string): Promise<string[]>;
}

export const graph: Graph = {
  async getGraphData() {
    // TODO: IPC call - window.electronAPI.graph.build()
    return { nodes: [], edges: [] };
  },
  async getBacklinks(path: string) {
    // TODO: IPC call - window.electronAPI.graph.getBacklinks(path)
    return [];
  },
};
