import { HistoryManager } from '../history';

describe('HistoryManager', () => {
  describe('listHistory', () => {
    it('should throw when called outside renderer context', async () => {
      const historyManager = new HistoryManager();
      await expect(
        historyManager.listHistory({
          vaultId: 'test-vault',
          filePath: 'test.md',
          page: 1,
          pageSize: 50,
        })
      ).rejects.toThrow('HistoryManager.listHistory is not implemented in core');
    });
  });
});
