import { graphStore } from '../stores/graph.store';

export function useGraph() {
  return graphStore.use();
}
