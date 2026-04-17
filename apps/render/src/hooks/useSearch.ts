import { searchStore } from '../stores/search.store';

export function useSearch() {
  return searchStore.use();
}
