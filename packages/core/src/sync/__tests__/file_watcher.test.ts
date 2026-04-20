import { Watcher } from '../file_watcher';
import { watch } from 'chokidar';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

jest.mock('chokidar');

describe('FileWatcher', () => {
  const testDir = '/tmp/aimo-test-watcher';
  let watcher: Watcher;
  let mockWatcherInstance: { on: jest.Mock; emit: jest.Mock; close: jest.Mock };

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true });
  });

  beforeEach(() => {
    (watch as jest.Mock).mockClear();
    mockWatcherInstance = {
      on: jest.fn(),
      emit: jest.fn(),
      close: jest.fn(),
    };
    (watch as jest.Mock).mockReturnValue(mockWatcherInstance);
  });

  it('should create watcher for vault path', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    expect(watch).toHaveBeenCalled();
  });

  it('should emit create event', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    // Get the 'add' handler registered by the Watcher constructor
    const addHandler = mockWatcherInstance.on.mock.calls.find((call) => call[0] === 'add')?.[1];
    addHandler(join(testDir, 'note1.md'));

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'create', path: 'note1.md' })
    );
  });

  it('should emit update event', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    const changeHandler = mockWatcherInstance.on.mock.calls.find((call) => call[0] === 'change')?.[1];
    changeHandler(join(testDir, 'note1.md'));

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update', path: 'note1.md' })
    );
  });

  it('should emit delete event', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    const unlinkHandler = mockWatcherInstance.on.mock.calls.find((call) => call[0] === 'unlink')?.[1];
    unlinkHandler(join(testDir, 'note1.md'));

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'delete', path: 'note1.md' })
    );
  });

  it('should stop watching', () => {
    const callback = jest.fn();
    watcher = new Watcher(testDir, callback);

    watcher.stop();

    expect(mockWatcherInstance.close).toHaveBeenCalled();
  });
});