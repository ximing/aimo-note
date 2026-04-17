import { searchService } from '../services/search.service';

export function useSearch() {
  return searchService.use();
}
