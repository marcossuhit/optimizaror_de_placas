import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const allowedOrigin = 'http://127.0.0.1:8000';
const wwwOrigin = 'http://localhost:8000';
process.env.OPTIMIZADOR_ALLOWED_ORIGIN = `${allowedOrigin},${wwwOrigin}`;
process.env.EMAIL_ADMIN_RECIPIENT = 'admin@example.com';

const { createEmailServer } = await import('./server.js');
let server;
let baseUrl;
let imageDirectory;

beforeEach(async () => {
  imageDirectory = await mkdtemp(path.join(os.tmpdir(), 'material-images-'));
  server = createEmailServer({
    imageDirectory,
    imageAdminEmails: ['operator@example.com'],
    clientId: 'test-client-id',
    verifyIdToken: async (token) => {
      if (token === 'operator-token') return { email: 'operator@example.com', email_verified: true };
      if (token === 'unverified-token') return { email: 'operator@example.com', email_verified: false };
      if (token === 'other-user-token') return { email: 'user@example.com', email_verified: true };
      throw new Error('Invalid token');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(imageDirectory, { recursive: true, force: true });
});

function writeHeaders(token = 'operator-token', origin = allowedOrigin) {
  return {
    Origin: origin,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

test('uploads, normalizes, exposes publicly, and deletes a material image', async () => {
  const source = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: '#dd4422' }
  }).png().toBuffer();
  const upload = await fetch(`${baseUrl}/api/material-images`, {
    method: 'POST',
    headers: writeHeaders(),
    body: JSON.stringify({ material: '  MDF BLANCO  ', imageDataUrl: `data:image/png;base64,${source.toString('base64')}` })
  });
  assert.equal(upload.status, 201);
  const { imageUrl } = await upload.json();
  assert.match(imageUrl, /^\/api\/material-images\/[a-f0-9]{64}\.jpg\?v=/);

  const lookup = await fetch(`${baseUrl}/api/material-images?material=${encodeURIComponent('mdf blanco')}`);
  assert.equal(lookup.status, 200);
  assert.equal((await lookup.json()).imageUrl, imageUrl);

  const imageResponse = await fetch(new URL(imageUrl, baseUrl));
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('content-type'), 'image/jpeg');
  const savedImage = await readFile(path.join(imageDirectory, `${imageUrl.match(/[a-f0-9]{64}/)[0]}.jpg`));
  const metadata = await sharp(savedImage).metadata();
  assert.ok(metadata.width <= 900);
  assert.ok(metadata.height <= 900);

  const replacementSource = await sharp({
    create: { width: 300, height: 300, channels: 3, background: '#2255dd' }
  }).png().toBuffer();
  const replacement = await fetch(`${baseUrl}/api/material-images`, {
    method: 'POST',
    headers: writeHeaders(),
    body: JSON.stringify({ material: 'mdf blanco', imageDataUrl: `data:image/png;base64,${replacementSource.toString('base64')}` })
  });
  assert.equal(replacement.status, 201);
  const { imageUrl: replacementUrl } = await replacement.json();
  assert.notEqual(replacementUrl, imageUrl);
  const latestLookup = await fetch(`${baseUrl}/api/material-images?material=${encodeURIComponent('MDF Blanco')}`);
  assert.equal((await latestLookup.json()).imageUrl, replacementUrl);

  const removal = await fetch(`${baseUrl}/api/material-images?material=${encodeURIComponent('MDF Blanco')}`, {
    method: 'DELETE',
    headers: { Origin: allowedOrigin, Authorization: 'Bearer operator-token' }
  });
  assert.equal(removal.status, 200);
  assert.deepEqual(await removal.json(), { deleted: true });
  assert.equal((await (await fetch(`${baseUrl}/api/material-images?material=MDF%20Blanco`)).json()).imageUrl, null);
});

test('rejects missing, invalid, unverified, and non-admin credentials', async () => {
  const missing = await fetch(`${baseUrl}/api/material-images`, {
    method: 'POST',
    headers: { Origin: allowedOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ material: 'MDF', imageDataUrl: 'data:image/jpeg;base64,AA==' })
  });
  assert.equal(missing.status, 401);

  for (const token of ['invalid-token', 'unverified-token']) {
    const response = await fetch(`${baseUrl}/api/material-images`, {
      method: 'POST',
      headers: writeHeaders(token),
      body: JSON.stringify({ material: 'MDF', imageDataUrl: 'data:image/jpeg;base64,AA==' })
    });
    assert.equal(response.status, token === 'invalid-token' ? 401 : 403);
  }

  const nonAdmin = await fetch(`${baseUrl}/api/material-images`, {
    method: 'POST',
    headers: writeHeaders('other-user-token'),
    body: JSON.stringify({ material: 'MDF', imageDataUrl: 'data:image/jpeg;base64,AA==' })
  });
  assert.equal(nonAdmin.status, 403);

  const wrongOrigin = await fetch(`${baseUrl}/api/material-images`, {
    method: 'POST',
    headers: writeHeaders('operator-token', 'https://evil.example'),
    body: JSON.stringify({ material: 'MDF', imageDataUrl: 'data:image/jpeg;base64,AA==' })
  });
  assert.equal(wrongOrigin.status, 403);

  const wwwWithoutToken = await fetch(`${baseUrl}/api/material-images`, {
    method: 'POST',
    headers: { Origin: wwwOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ material: 'MDF', imageDataUrl: 'data:image/jpeg;base64,AA==' })
  });
  assert.equal(wwwWithoutToken.status, 401);
});

test('rejects malformed images and malformed public file paths', async () => {
  const response = await fetch(`${baseUrl}/api/material-images`, {
    method: 'POST',
    headers: writeHeaders(),
    body: JSON.stringify({ material: 'MDF', imageDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+' })
  });
  assert.equal(response.status, 400);

  const invalidPath = await fetch(`${baseUrl}/api/material-images/../../etc/passwd.jpg`);
  assert.equal(invalidPath.status, 404);
});