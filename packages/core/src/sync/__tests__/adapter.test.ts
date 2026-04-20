import { S3Adapter } from '../adapter';
import type { S3Config } from '@aimo-note/dto';

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
  PutObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
  ListObjectsV2Command: jest.fn().mockImplementation((params) => ({ input: params })),
  DeleteObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
  HeadObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
}));

describe('S3Adapter', () => {
  const config: S3Config = {
    bucket: 'test-bucket',
    region: 'us-east-1',
    endpoint: 'https://s3.example.com',
    forcePathStyle: true,
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  };

  let adapter: S3Adapter;

  beforeEach(() => {
    mockSend.mockReset().mockResolvedValue({});
    adapter = new S3Adapter(config);
  });

  it('should build correct vault path prefix', () => {
    expect(adapter.getVaultPrefix()).toBe('vault/.aimo/');
  });

  it('should get object from S3', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: () => Promise.resolve('test content') },
    });

    const result = await adapter.getObject('.aimo/manifest.json');
    expect(result).toBe('test content');
    expect(mockSend).toHaveBeenCalled();
  });

  it('should return null for missing object', async () => {
    mockSend.mockRejectedValueOnce({ name: 'NoSuchKey' });

    const result = await adapter.getObject('.aimo/nonexistent.json');
    expect(result).toBeNull();
  });

  it('should put object to S3', async () => {
    await adapter.putObject('.aimo/versions/note1.md/v1.content', 'file content');

    expect(mockSend).toHaveBeenCalled();
    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.input.Key).toBe('vault/.aimo/versions/note1.md/v1.content');
    expect(callArg.input.Body).toBe('file content');
  });

  it('should list objects with prefix', async () => {
    mockSend.mockResolvedValueOnce({
      Contents: [
        { Key: 'vault/.aimo/versions/note1.md/v1.content', Size: 100 },
        { Key: 'vault/.aimo/versions/note1.md/v2.content', Size: 120 },
      ],
      IsTruncated: false,
    });

    const result = await adapter.listObjects('.aimo/versions/');
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('vault/.aimo/versions/note1.md/v1.content');
  });

  it('should delete object from S3', async () => {
    await adapter.deleteObject('.aimo/versions/note1.md/v1.content');

    expect(mockSend).toHaveBeenCalled();
    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.input.Key).toBe('vault/.aimo/versions/note1.md/v1.content');
  });

  it('should return false for headObject on missing key', async () => {
    mockSend.mockRejectedValueOnce({ name: 'NoSuchKey' });

    const result = await adapter.exists('.aimo/manifest.json');
    expect(result).toBe(false);
  });

  it('should return true for headObject on existing key', async () => {
    mockSend.mockResolvedValueOnce({ ContentLength: 100 });

    const result = await adapter.exists('.aimo/manifest.json');
    expect(result).toBe(true);
  });
});