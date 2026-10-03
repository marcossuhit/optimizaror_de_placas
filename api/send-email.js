import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT || '465', 10);
const ADMIN_RECIPIENT = process.env.EMAIL_ADMIN_RECIPIENT?.trim();
const DEFAULT_SMTP_SECURE = (() => {
  const explicit = process.env.SMTP_SECURE;
  if (explicit != null) return explicit !== 'false';
  return SMTP_PORT === 465;
})();

let transporterPromise = null;

async function resolveTransporter() {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      if (!SMTP_HOST || !user || !pass || !process.env.SMTP_FROM?.trim() || !ADMIN_RECIPIENT) {
        throw new Error('El servidor necesita SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM y EMAIL_ADMIN_RECIPIENT.');
      }
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: DEFAULT_SMTP_SECURE,
        auth: { user, pass }
      });
      if (process.env.VERIFY_SMTP !== 'false') {
        await transporter.verify().catch((err) => {
          console.error('[send-email] Error verificando SMTP', err);
          throw err;
        });
      }
      return transporter;
    })();
  }
  return transporterPromise;
}

function normalizeAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  return rawAttachments
    .filter((att) => att && att.filename && att.content)
    .map((att) => ({
      filename: String(att.filename),
      content: Buffer.from(att.content, 'base64'),
      contentType: att.mimeType || att.type || 'application/octet-stream'
    }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { to, subject, text, html, attachments } = req.body || {};

    const recipient = typeof to === 'string' && to.trim()
      ? to.trim().toLowerCase()
      : ADMIN_RECIPIENT.toLowerCase();
    if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return res.status(400).json({ error: 'El destinatario debe ser una dirección de correo válida.' });
    }
    if (!subject) {
      return res.status(400).json({ error: 'El payload debe incluir subject.' });
    }

    const transporter = await resolveTransporter();
    const senderAddress = process.env.SMTP_FROM.trim();
    const senderName = process.env.SMTP_FROM_NAME || 'Optimizador de Placas';
    const safeText = text && String(text).trim() ? String(text).trim() : undefined;
    const safeHtml = html && String(html).trim() ? String(html).trim() : undefined;

    const mailOptions = {
      from: { name: senderName, address: senderAddress },
      to: recipient,
      subject: String(subject),
      text: safeText,
      html: safeHtml,
      attachments: normalizeAttachments(attachments)
    };
    if (recipient !== ADMIN_RECIPIENT.toLowerCase()) {
      mailOptions.bcc = ADMIN_RECIPIENT;
    }

    const replyTo = process.env.SMTP_REPLY_TO?.trim();
    if (replyTo) mailOptions.replyTo = replyTo;

    const info = await transporter.sendMail(mailOptions);
    return res.status(200).json({ messageId: info.messageId, accepted: info.accepted, rejected: info.rejected });
  } catch (error) {
    console.error('[send-email] Unexpected error', error);
    const status = error?.responseCode && Number.isInteger(error.responseCode) ? error.responseCode : 500;
    const message = error?.message || 'No se pudo enviar el correo.';
    return res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
  }
}
