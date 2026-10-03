import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import sharp from 'sharp';
import sendEmailHandler from './send-email.js';

const PORT = Number.parseInt(process.env.PORT || '4010', 10);
const HOST = process.env.HOST || '127.0.0.1';
const allowedOrigins = new Set((process.env.OPTIMIZADOR_ALLOWED_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean));
const adminRecipient = process.env.EMAIL_ADMIN_RECIPIENT?.trim().toLowerCase();
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const materialImageDirectory = process.env.MATERIAL_IMAGE_STORAGE_DIR || '/var/lib/optimizador/material-images';
const materialImageAdminEmails = (process.env.MATERIAL_IMAGE_ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BODY_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_INPUT_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_OUTPUT_BYTES = 512 * 1024;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_REQUESTS = 10;
const IMAGE_RATE_MAX_REQUESTS = 20;
const requestsByIp = new Map();
const imageRequestsByIp = new Map();

if (!allowedOrigins.size || !adminRecipient) {
  throw new Error('Definí OPTIMIZADOR_ALLOWED_ORIGIN y EMAIL_ADMIN_RECIPIENT antes de iniciar el servicio.');
}

function sendJson(res, status, payload) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, res, maxBodyBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > maxBodyBytes) {
      sendJson(res, 413, { error: 'El cuerpo de la solicitud es demasiado grande.' });
      req.resume();
      resolve(null);
      return;
    }

    const chunks = [];
    let size = 0;
    let finished = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes && !finished) {
        finished = true;
        sendJson(res, 413, { error: 'El cuerpo de la solicitud es demasiado grande.' });
        chunks.length = 0;
      } else if (!finished) {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      if (finished) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('El cuerpo debe ser JSON válido.'));
      }
    });
    req.on('error', reject);
  });
}

function consumeRateLimit(ip, now = Date.now(), requests = requestsByIp, maxRequests = RATE_MAX_REQUESTS) {
  const current = requests.get(ip);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requests.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= maxRequests) return false;
  current.count += 1;
  return true;
}

function normalizeMaterialName(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : '';
}

function getMaterialImageKey(material) {
  return createHash('sha256').update(normalizeMaterialName(material)).digest('hex');
}

function getImageUrl(key, image) {
  const version = createHash('sha256').update(image).digest('hex').slice(0, 16);
  return `/api/material-images/${key}.jpg?v=${version}`;
}

function imagePath(directory, key) {
  return path.join(directory, `${key}.jpg`);
}

function parseImageDataUrl(value) {
  if (typeof value !== 'string' || value.length > MAX_IMAGE_INPUT_BYTES * 1.5) return null;
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) return null;
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_INPUT_BYTES) return null;
  return buffer;
}

async function normalizeUploadedImage(input) {
  const pipeline = sharp(input, { limitInputPixels: 20_000_000, failOn: 'error' })
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true });
  let output = await pipeline.clone().jpeg({ quality: 72, mozjpeg: true }).toBuffer();
  if (output.length > MAX_IMAGE_OUTPUT_BYTES) {
    output = await pipeline.jpeg({ quality: 55, mozjpeg: true }).toBuffer();
  }
  if (output.length > MAX_IMAGE_OUTPUT_BYTES) {
    throw new Error('La imagen optimizada supera el tamaño permitido.');
  }
  return output;
}

function getBearerToken(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return match ? match[1].trim() : '';
}

export function createEmailServer({
  imageDirectory = materialImageDirectory,
  imageAdminEmails = materialImageAdminEmails,
  clientId = googleClientId,
  verifyIdToken
} = {}) {
  const adminEmails = new Set(Array.isArray(imageAdminEmails)
    ? imageAdminEmails.map((email) => String(email).trim().toLowerCase()).filter(Boolean)
    : String(imageAdminEmails || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
  const googleClient = clientId ? new OAuth2Client(clientId) : null;
  const verifyToken = verifyIdToken || (async (idToken) => {
    if (!googleClient) throw new Error('La autenticación de Google no está configurada.');
    const ticket = await googleClient.verifyIdToken({ idToken, audience: clientId });
    return ticket.getPayload();
  });

  async function authorizeImageWrite(req) {
    if (!clientId || !adminEmails.size) {
      return { status: 503, error: 'La autorización de imágenes no está configurada.' };
    }
    const idToken = getBearerToken(req);
    if (!idToken || idToken.length > 12000) {
      return { status: 401, error: 'Se requiere una sesión de Google válida.' };
    }
    let payload;
    try {
      payload = await verifyToken(idToken);
    } catch (_) {
      return { status: 401, error: 'El token de Google no es válido o expiró.' };
    }
    const email = String(payload?.email || '').trim().toLowerCase();
    if (!email || payload?.email_verified !== true) {
      return { status: 403, error: 'La cuenta de Google debe tener un correo verificado.' };
    }
    if (!adminEmails.has(email)) {
      return { status: 403, error: 'La cuenta no está autorizada para modificar imágenes.' };
    }
    return { email };
  }

  async function handleMaterialImageRequest(req, res, pathname, url) {
    if (req.method === 'GET' && pathname === '/api/material-images') {
      const material = normalizeMaterialName(url.searchParams.get('material'));
      if (!material || material.length > 160) {
        return sendJson(res, 400, { error: 'Indicá un material válido.' });
      }
      const key = getMaterialImageKey(material);
      try {
        const image = await readFile(imagePath(imageDirectory, key));
        return sendJson(res, 200, { imageUrl: getImageUrl(key, image) });
      } catch (error) {
        if (error.code === 'ENOENT') return sendJson(res, 200, { imageUrl: null });
        console.error('[material-images] No se pudo leer la imagen', error);
        return sendJson(res, 500, { error: 'No se pudo consultar la imagen.' });
      }
    }

    const fileMatch = /^\/api\/material-images\/([a-f0-9]{64})\.jpg$/.exec(pathname);
    if (req.method === 'GET' && fileMatch) {
      try {
        const image = await readFile(imagePath(imageDirectory, fileMatch[1]));
        res.writeHead(200, {
          'Content-Type': 'image/jpeg',
          'Content-Length': image.length,
          'Cache-Control': 'public, max-age=300, must-revalidate',
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(image);
      } catch (error) {
        if (error.code === 'ENOENT') return sendJson(res, 404, { error: 'Imagen no encontrada.' });
        console.error('[material-images] No se pudo servir la imagen', error);
        return sendJson(res, 500, { error: 'No se pudo servir la imagen.' });
      }
    }

    if (pathname !== '/api/material-images') {
      return sendJson(res, 404, { error: 'Imagen no encontrada.' });
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return sendJson(res, 405, { error: 'Método no permitido.' });
    }
    if (!allowedOrigins.has(req.headers.origin)) {
      return sendJson(res, 403, { error: 'Origen no autorizado.' });
    }
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
      return sendJson(res, 415, { error: 'Se requiere Content-Type application/json.' });
    }

    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    if (!consumeRateLimit(ip, Date.now(), imageRequestsByIp, IMAGE_RATE_MAX_REQUESTS)) {
      return sendJson(res, 429, { error: 'Límite de cambios de imágenes alcanzado. Intentá más tarde.' });
    }
    const authorization = await authorizeImageWrite(req);
    if (authorization.error) return sendJson(res, authorization.status, { error: authorization.error });

    if (req.method === 'DELETE') {
      const material = normalizeMaterialName(url.searchParams.get('material'));
      if (!material || material.length > 160) {
        return sendJson(res, 400, { error: 'Indicá un material válido.' });
      }
      const key = getMaterialImageKey(material);
      try {
        await rm(imagePath(imageDirectory, key), { force: true });
        return sendJson(res, 200, { deleted: true });
      } catch (error) {
        console.error('[material-images] No se pudo borrar la imagen', error);
        return sendJson(res, 500, { error: 'No se pudo quitar la imagen.' });
      }
    }

    let body;
    try {
      body = await readJsonBody(req, res, MAX_IMAGE_BODY_BYTES);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
    if (res.writableEnded || body === null) return;
    const material = normalizeMaterialName(body?.material);
    if (!material || material.length > 160) {
      return sendJson(res, 400, { error: 'Indicá un material válido.' });
    }
    const input = parseImageDataUrl(body?.imageDataUrl);
    if (!input) {
      return sendJson(res, 400, { error: 'La imagen debe ser JPEG, PNG o WebP y pesar menos de 1,5 MB.' });
    }

    let output;
    try {
      output = await normalizeUploadedImage(input);
    } catch (error) {
      const status = /supera el tamaño permitido/.test(error.message) ? 413 : 400;
      return sendJson(res, status, { error: status === 413 ? error.message : 'El archivo no contiene una imagen válida.' });
    }

    const key = getMaterialImageKey(material);
    const targetPath = imagePath(imageDirectory, key);
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    try {
      await mkdir(imageDirectory, { recursive: true, mode: 0o750 });
      await writeFile(temporaryPath, output, { flag: 'wx', mode: 0o640 });
      await rename(temporaryPath, targetPath);
      return sendJson(res, 201, { imageUrl: getImageUrl(key, output) });
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      console.error('[material-images] No se pudo guardar la imagen', error);
      return sendJson(res, 500, { error: 'No se pudo guardar la imagen.' });
    }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = url.pathname;
    if (req.method === 'GET' && pathname === '/health') {
      return sendJson(res, 200, { status: 'ok' });
    }
    if (pathname === '/api/material-images' || pathname.startsWith('/api/material-images/')) {
      return handleMaterialImageRequest(req, res, pathname, url);
    }
    if (pathname !== '/api/send-email') {
      return sendJson(res, 404, { error: 'No encontrado.' });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Método no permitido.' });
    }
    if (!allowedOrigins.has(req.headers.origin)) {
      return sendJson(res, 403, { error: 'Origen no autorizado.' });
    }
    if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
      return sendJson(res, 415, { error: 'Se requiere Content-Type application/json.' });
    }

    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    if (!consumeRateLimit(ip)) {
      return sendJson(res, 429, { error: 'Límite de envíos alcanzado. Intentá más tarde.' });
    }

    let body;
    try {
      body = await readJsonBody(req, res);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
    if (res.writableEnded || body === null) return;

    const requestedRecipient = body?.to == null || body.to === ''
      ? adminRecipient
      : String(body.to).trim().toLowerCase();
    if (requestedRecipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedRecipient)) {
      return sendJson(res, 400, { error: 'El destinatario debe ser una dirección de correo válida.' });
    }

    const handlerResponse = {
      statusCode: 200,
      setHeader: (name, value) => res.setHeader(name, value),
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        sendJson(res, this.statusCode, payload);
        return this;
      }
    };

    try {
      await sendEmailHandler({ method: req.method, body: { ...body, to: requestedRecipient } }, handlerResponse);
    } catch (error) {
      console.error('[send-email] Error del servicio', error);
      sendJson(res, 500, { error: 'No se pudo enviar el correo.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createEmailServer().listen(PORT, HOST, () => {
    console.log(`Servicio de correo escuchando en http://${HOST}:${PORT}`);
  });
}