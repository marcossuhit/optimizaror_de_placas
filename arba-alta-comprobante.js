#!/usr/bin/env node
"use strict";

/**
 * Script para:
 * 1) Autenticarse (si corresponde) contra ARBA A122R.
 * 2) Iniciar DJ (declaracion jurada).
 * 3) Dar de alta un comprobante usando el idDj devuelto.
 * 4) Guardar el idDj en un archivo de salida.
 *
 * Uso:
 *   node arba-alta-comprobante.js ./arba-payload.json
 *
 * Variables de entorno:
 *   ARBA_DECLARACION_URL=https://app.arba.gov.ar/a122rSrv/api/external/declaracionJurada
 *   ARBA_COMPROBANTE_URL=https://app.arba.gov.ar/a122rSrv/api/external/comprobante
 *   ARBA_AUTH_URL=https://app.arba.gov.ar/a122rSrv/api/external/comprobante
 *   ARBA_AUTH_MODE=token|basic|none
 *   ARBA_TOKEN=<token>
 *   ARBA_USERNAME=<usuario>
 *   ARBA_PASSWORD=<password>
 *   ARBA_AUTH_PAYLOAD='{"username":"...","password":"..."}'
 *   ARBA_IDDJ_OUTPUT=./idDj.json
 *   ARBA_TIMEOUT_MS=30000
 */

const fs = require("fs/promises");
const path = require("path");

const DECLARACION_URL =
  process.env.ARBA_DECLARACION_URL ||
  "https://app.arba.gov.ar/a122rSrv/api/external/declaracionJurada";
const COMPROBANTE_URL =
  process.env.ARBA_COMPROBANTE_URL ||
  "https://app.arba.gov.ar/a122rSrv/api/external/comprobante";
const AUTH_URL = process.env.ARBA_AUTH_URL || COMPROBANTE_URL;
const AUTH_MODE = String(process.env.ARBA_AUTH_MODE || "token").toLowerCase();
const IDDJ_OUTPUT =
  process.env.ARBA_IDDJ_OUTPUT || path.resolve(process.cwd(), "idDj.json");
const TIMEOUT_MS = Number(process.env.ARBA_TIMEOUT_MS || 30000);

function buildAbortController(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeout };
}

async function readJsonFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(abs, "utf8");
  return JSON.parse(raw);
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pickToken(payload) {
  if (!payload || typeof payload !== "object") return null;
  return (
    payload.access_token ||
    payload.accessToken ||
    payload.token ||
    payload.jwt ||
    payload?.data?.access_token ||
    payload?.data?.accessToken ||
    payload?.data?.token ||
    null
  );
}

function pickIdDj(payload, fallbackPayload) {
  if (payload && typeof payload === "object") {
    if (payload.idDj != null) return payload.idDj;
    if (payload.id != null) return payload.id;
    if (payload?.data?.idDj != null) return payload.data.idDj;
    if (payload?.data?.id != null) return payload.data.id;
    if (payload?.declaracionJurada?.idDj != null) return payload.declaracionJurada.idDj;
    if (payload?.declaracionJurada?.id != null) return payload.declaracionJurada.id;
  }
  if (fallbackPayload && typeof fallbackPayload === "object") {
    return fallbackPayload.idDj ?? null;
  }
  return null;
}

function buildAuthPayloadFromEnv() {
  if (process.env.ARBA_AUTH_PAYLOAD) {
    return JSON.parse(process.env.ARBA_AUTH_PAYLOAD);
  }

  const username = process.env.ARBA_USERNAME;
  const password = process.env.ARBA_PASSWORD;
  if (username && password) {
    return { username, password };
  }
  return {};
}

async function authenticate() {
  if (AUTH_MODE === "none") {
    return null;
  }

  if (AUTH_MODE === "token") {
    if (process.env.ARBA_TOKEN) {
      return process.env.ARBA_TOKEN;
    }

    const authPayload = buildAuthPayloadFromEnv();
    const { controller, timeout } = buildAbortController(TIMEOUT_MS);
    try {
      const response = await fetch(AUTH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(authPayload),
        signal: controller.signal
      });

      const text = await response.text();
      const json = safeJsonParse(text);

      if (!response.ok) {
        throw new Error(
          `Error de autenticación (${response.status}): ${
            json?.message || text || "sin detalle"
          }`
        );
      }

      const token = pickToken(json);
      if (!token) {
        throw new Error(
          "No se encontró token en la respuesta de autenticación. Definí ARBA_TOKEN o ajustá ARBA_AUTH_PAYLOAD/ARBA_AUTH_URL."
        );
      }

      return token;
    } finally {
      clearTimeout(timeout);
    }
  }

  if (AUTH_MODE === "basic") {
    const username = process.env.ARBA_USERNAME;
    const password = process.env.ARBA_PASSWORD;
    if (!username || !password) {
      throw new Error(
        "Faltan ARBA_USERNAME/ARBA_PASSWORD para AUTH_MODE=basic."
      );
    }
    const value = Buffer.from(`${username}:${password}`).toString("base64");
    return `Basic ${value}`;
  }

  throw new Error(
    `ARBA_AUTH_MODE inválido: ${AUTH_MODE}. Usá token, basic o none.`
  );
}

function buildHeaders(tokenOrAuth) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (!tokenOrAuth) return headers;
  headers.Authorization =
    tokenOrAuth.startsWith("Basic ") ? tokenOrAuth : `Bearer ${tokenOrAuth}`;
  return headers;
}

async function postJson(url, payload, headers, errorPrefix) {
  const { controller, timeout } = buildAbortController(TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    const json = safeJsonParse(text);

    if (!response.ok) {
      throw new Error(
        `${errorPrefix} (${response.status}): ${
          json?.message || text || "sin detalle"
        }`
      );
    }

    return json ?? { raw: text };
  } finally {
    clearTimeout(timeout);
  }
}

async function iniciarDeclaracionJurada(payload, headers) {
  return postJson(
    DECLARACION_URL,
    payload,
    headers,
    "Error al iniciar declaración jurada"
  );
}

async function altaComprobante(payload, headers) {
  return postJson(
    COMPROBANTE_URL,
    payload,
    headers,
    "Error al dar de alta comprobante"
  );
}

async function saveIdDj(idDj, djResponse, comprobanteResponse) {
  const output = {
    idDj,
    savedAt: new Date().toISOString(),
    responses: {
      declaracionJurada: djResponse,
      comprobante: comprobanteResponse
    }
  };
  await fs.writeFile(IDDJ_OUTPUT, JSON.stringify(output, null, 2), "utf8");
}

function normalizeInputPayload(inputPayload) {
  const hasNested =
    inputPayload &&
    typeof inputPayload === "object" &&
    inputPayload.declaracionJurada &&
    inputPayload.comprobante;

  if (hasNested) {
    return {
      declaracionJurada: inputPayload.declaracionJurada,
      comprobante: inputPayload.comprobante
    };
  }

  throw new Error(
    "JSON inválido. Formato esperado: { \"declaracionJurada\": {...}, \"comprobante\": {...} }"
  );
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    throw new Error(
      "Falta el path al JSON de entrada. Ejemplo: node arba-alta-comprobante.js ./arba-payload.json"
    );
  }

  const inputPayload = await readJsonFile(inputPath);
  const { declaracionJurada, comprobante } = normalizeInputPayload(inputPayload);

  const tokenOrAuth = await authenticate();
  const headers = buildHeaders(tokenOrAuth);

  const djResponse = await iniciarDeclaracionJurada(declaracionJurada, headers);
  const idDj = pickIdDj(djResponse, declaracionJurada);

  if (idDj == null) {
    throw new Error(
      "No se pudo obtener idDj desde el servicio de inicio de DJ."
    );
  }

  const comprobantePayload = {
    ...comprobante,
    idDj
  };

  const comprobanteResponse = await altaComprobante(comprobantePayload, headers);

  await saveIdDj(idDj, djResponse, comprobanteResponse);

  console.log("DJ iniciada y comprobante enviado correctamente.");
  console.log(`idDj: ${idDj}`);
  console.log(`Guardado en: ${IDDJ_OUTPUT}`);
}

main().catch((error) => {
  console.error("Fallo el proceso:", error.message);
  process.exitCode = 1;
});
