import { graphService } from '../services/graph.service';

export function useGraph() {
  return graphService.use();
}
