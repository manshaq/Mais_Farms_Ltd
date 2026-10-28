import crypto from 'node:crypto';

export interface S3BackupConfig {
  configured: boolean;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  objectLockSupported: boolean;
}

export function getS3BackupConfig(): S3BackupConfig {
  const endpoint = (process.env.BACKUP_S3_ENDPOINT || '').trim();
  const region = (process.env.BACKUP_S3_REGION || 'auto').trim();
  const bucket = (process.env.BACKUP_S3_BUCKET || '').trim();
  const accessKeyId = (process.env.BACKUP_S3_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.BACKUP_S3_SECRET_ACCESS_KEY || '').trim();
  const prefix = (process.env.BACKUP_S3_PREFIX || 'mais-ltd-backups/').trim();

  const configured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
  return {
    configured,
    endpoint: endpoint ? endpoint.replace(/^https?:\/\//, '') : '',
    region,
    bucket,
    prefix: prefix.endsWith('/') ? prefix : `${prefix}/`,
    objectLockSupported: process.env.BACKUP_S3_OBJECT_LOCK_ENABLED !== 'false',
  };
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data, 'utf-8').digest();
}

function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, regionName);
  const kService = hmacSha256(kRegion, serviceName);
  return hmacSha256(kService, 'aws4_request');
}

/**
 * Uploads an encrypted backup buffer to a private S3-compatible off-site bucket over HTTPS (TLS)
 * using AWS Signature Version 4, server-side encryption (AES256), and optional S3 Object Lock.
 */
export async function uploadEncryptedBackupToS3(params: {
  fileName: string;
  body: Buffer;
  sha256Checksum: string;
  objectLockRetainUntilIso: string | null;
}): Promise<{ uploaded: boolean; s3Key: string | null }> {
  const cfg = getS3BackupConfig();
  if (!cfg.configured) {
    return { uploaded: false, s3Key: null };
  }

  const rawEndpoint = (process.env.BACKUP_S3_ENDPOINT || '').trim();
  const normalizedEndpoint = rawEndpoint.startsWith('http')
    ? rawEndpoint.replace(/^http:\/\//i, 'https://') // Enforce TLS in transit
    : `https://${rawEndpoint}`;

  const accessKeyId = (process.env.BACKUP_S3_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.BACKUP_S3_SECRET_ACCESS_KEY || '').trim();
  const s3Key = `${cfg.prefix}${params.fileName}`;

  const baseUrl = new URL(normalizedEndpoint);
  const objectPath = `/${cfg.bucket}/${s3Key}`.replace(/\/+/g, '/');
  const targetUrl = new URL(objectPath, baseUrl);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(params.body);
  const contentMd5 = crypto.createHash('md5').update(params.body).digest('base64');

  const headers: Record<string, string> = {
    host: targetUrl.host,
    'content-length': String(params.body.length),
    'content-md5': contentMd5,
    'content-type': 'application/octet-stream',
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    'x-amz-meta-mais-sha256': params.sha256Checksum,
    'x-amz-server-side-encryption': 'AES256',
  };

  if (params.objectLockRetainUntilIso && cfg.objectLockSupported) {
    headers['x-amz-object-lock-mode'] = 'GOVERNANCE';
    headers['x-amz-object-lock-retain-until-date'] = params.objectLockRetainUntilIso;
  }

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${headers[k].trim()}\n`)
    .join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    'PUT',
    targetUrl.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, cfg.region, 's3');
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(stringToSign, 'utf-8')
    .digest('hex');

  headers[
    'Authorization'
  ] = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(targetUrl.toString(), {
    method: 'PUT',
    headers,
    body: new Uint8Array(params.body),
  });

  if (!res.ok) {
    throw new Error(`S3 off-site upload returned HTTP ${res.status} (${res.statusText}).`);
  }

  return { uploaded: true, s3Key };
}
