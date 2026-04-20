export type ImageStorageType = 'local' | 's3';

export interface LocalImageStorageConfig {
  type: 'local';
  local: {
    path: string; // default: 'assets/images'
  };
}

export interface S3ImageStorageConfig {
  type: 's3';
  s3: {
    accessKey: string;
    secretKey: string;
    bucket: string;
    region: string;
    endpoint?: string; // optional
    keyPrefix?: string; // optional, default ''
  };
}

export type ImageStorageConfig = LocalImageStorageConfig | S3ImageStorageConfig;

export interface ClipboardImageData {
  arrayBuffer: ArrayBuffer;
  mimeType: string;
}

export interface ImageStorageUploadResult {
  url: string; // relative path for local, full URL for S3
}
