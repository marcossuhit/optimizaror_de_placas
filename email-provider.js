;(function () {
  const cfg = window.EMAIL_PROVIDER_CONFIG || {};
  const API_ENDPOINT = cfg.apiEndpoint || window.EMAIL_PROVIDER_ENDPOINT || '/api/send-email';

  async function sendViaApi({ to, subject, text, html, attachments }) {
    const payload = {
      subject,
      text,
      html,
      attachments: attachments || []
    };
    if (to) payload.to = to;

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let details = '';
      try {
        const errBody = await response.json();
        details = errBody?.error ? `: ${errBody.error}` : '';
      } catch (_) {}
      throw new Error(`El servidor de correo respondió ${response.status}${details}`);
    }

    try {
      return await response.json();
    } catch (_) {
      return null;
    }
  }

  async function GenericMailProvider(options) {
    const normalized = {
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments || []
    };
    return sendViaApi(normalized);
  }

  window.GenericMailProvider = GenericMailProvider;
  window.sendViaApi = sendViaApi;
})();
