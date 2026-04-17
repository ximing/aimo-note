import { Service, resolve } from '@rabjs/react';
import type { GraphData } from '../types/graph';

export class GraphService extends Service {
  data: GraphData = { nodes: [], edges: [] };
  selectedNode: string | null = null;
  viewState: { zoom: number; pan: { x: number; y: number } } = { zoom: 1, pan: { x: 0, y: 0 } };
}

export function useGraphService(): GraphService {
  return resolve(GraphService);
}
