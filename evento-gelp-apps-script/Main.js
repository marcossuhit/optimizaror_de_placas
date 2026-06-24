var CONFIG = {
  DESTINATION_EMAIL: "desafiodellobo@gmail.com",
  EVENT_NAME: "Inscripcion Evento Deportivo - Club Gimnasia",
  SENDER_NAME: "EL LOBO TE ESPERA",
  PUBLIC_REPLY_TO: "desafiodellobo@gmail.com",
  USE_NO_REPLY: true,
  SPREADSHEET_ID: "1c__JlWA42umm6RbiwcTdjo2DNAsdgK-s2PMw2GUKR9M",
  SHEET_NAME: "Inscripciones",
  SHEET_COLUMNS: [
    "nombre_apellido",
    "doc",
    "fecha_nacimiento",
    "mail",
    "telefono",
    "distancia",
    "categoria",
    "grupo_entrenamiento",
    "talle_remera",
    "monto_final"
  ],
  SHEET_COLUMN_LABELS: {
    nombre_apellido: "Nombre y apellido",
    doc: "Documento",
    fecha_nacimiento: "Fecha de nacimiento",
    mail: "Correo electronico",
    telefono: "Telefono",
    distancia: "Distancia",
    categoria: "Categoria",
    grupo_entrenamiento: "Grupo de entrenamiento",
    talle_remera: "Talle de remera",
    monto_final: "Monto final (ARS)"
  },
  IMAGE_DRIVE_FILE_ID: "1md5M7OmuMFo-DQ4KAcpB-l56aggG4lAw",
  TRAINING_GROUPS: ["Diego Simon Trail Running", "Kumelen Running"],
  SHIRT_SIZES: ["XS", "S", "M", "L", "XL", "XXL"],
  DISCOUNT_CODES: {
    LOBO10: 10,
    LOBO20: 20,
    LOBO30: 30,
    LOBO40: 40,
    LOBO50: 50,
    LOBOFULL: 100
  }
};

function doGet() {
  var t = getMainTemplate();
  t.trainingGroups = CONFIG.TRAINING_GROUPS;
  t.shirtSizes = CONFIG.SHIRT_SIZES;
  t.eventImageSrc = getEventImageSrc();
  var out = t.evaluate();
  out.setTitle("Inscripcion Evento - Gimnasia");
  return out;
}

function getMainTemplate() {
  try {
    return HtmlService.createTemplateFromFile("index");
  } catch (e1) {
    try {
      return HtmlService.createTemplateFromFile("Index");
    } catch (e2) {
      throw new Error("No se encontro el archivo HTML principal (index/Index).");
    }
  }
}

function resolveDistancePrice(distance, dateObj) {
  var baseDate = dateObj || new Date();
  var current = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  var year = current.getFullYear();
  var august2 = new Date(year, 7, 2);
  var september2 = new Date(year, 8, 2);

  if (current >= september2) {
    throw new Error("La pre-inscripcion online finalizo el 1 de septiembre.");
  }

  if (distance === "4 KM (Caminantes)") {
    return 40000;
  }

  if (current < august2) return 50000;
  return 60000;
}

function applyDiscountToAmount(baseAmount, discountPercent) {
  var safeBase = Number(baseAmount) || 0;
  var safeDiscount = Number(discountPercent) || 0;
  if (safeDiscount <= 0) return safeBase;
  if (safeDiscount >= 100) return 0;
  return Math.round(safeBase * (100 - safeDiscount) / 100);
}

function formatBirthDateForEmail(dateString) {
  var value = String(dateString || "").trim();
  var match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return match[3] + "-" + match[2] + "-" + match[1];
  }
  return value;
}

function formatMoneyForEmail(amount) {
  var safe = Number(amount) || 0;
  return "$" + safe.toLocaleString("es-AR");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtmlEmailShell(title, subtitle, contentHtml) {
  return (
    "<div style='margin:0;padding:20px;background:#f3f7ff;font-family:Arial,sans-serif;color:#10213f;'>" +
      "<div style='max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #d6e3ff;border-radius:14px;overflow:hidden;'>" +
        "<div style='padding:18px 20px;background:linear-gradient(120deg,#0d1b3d,#0047ab);color:#ffffff;'>" +
          "<h2 style='margin:0;font-size:22px;line-height:1.2;'>" + escapeHtml(title) + "</h2>" +
          "<p style='margin:6px 0 0;font-size:14px;opacity:.95;'>" + escapeHtml(subtitle) + "</p>" +
        "</div>" +
        "<div style='padding:18px 20px;'>" + contentHtml + "</div>" +
      "</div>" +
    "</div>"
  );
}

function buildDataRowHtml(label, value) {
  return (
    "<tr>" +
      "<td style='padding:8px 10px;border-bottom:1px solid #edf2ff;width:220px;color:#3b4f77;font-weight:700;'>" + escapeHtml(label) + "</td>" +
      "<td style='padding:8px 10px;border-bottom:1px solid #edf2ff;color:#14274b;'>" + escapeHtml(value) + "</td>" +
    "</tr>"
  );
}

function buildOrganizerHtmlEmail(data) {
  var summaryHtml =
    "<div style='display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;'>" +
      "<div style='padding:10px 12px;border-radius:10px;background:#eef4ff;border:1px solid #d6e3ff;'>" +
        "<div style='font-size:12px;color:#44608f;font-weight:700;'>DISTANCIA</div>" +
        "<div style='font-size:16px;color:#10213f;font-weight:800;'>" + escapeHtml(data.distance) + "</div>" +
      "</div>" +
      "<div style='padding:10px 12px;border-radius:10px;background:#eef4ff;border:1px solid #d6e3ff;'>" +
        "<div style='font-size:12px;color:#44608f;font-weight:700;'>MONTO FINAL</div>" +
        "<div style='font-size:16px;color:#0f7a32;font-weight:800;'>" + escapeHtml(formatMoneyForEmail(data.finalAmount)) + "</div>" +
      "</div>" +
      "<div style='padding:10px 12px;border-radius:10px;background:#eef4ff;border:1px solid #d6e3ff;'>" +
        "<div style='font-size:12px;color:#44608f;font-weight:700;'>CODIGO</div>" +
        "<div style='font-size:16px;color:#10213f;font-weight:800;'>" + escapeHtml(data.discountCode || "Sin codigo") + "</div>" +
      "</div>" +
    "</div>";

  var tableHtml =
    "<table style='width:100%;border-collapse:collapse;border:1px solid #e7efff;border-radius:10px;overflow:hidden;'>" +
      buildDataRowHtml("Nombre y Apellido", data.fullName) +
      buildDataRowHtml("Documento", data.document) +
      buildDataRowHtml("Fecha Nacimiento", data.birthDate) +
      buildDataRowHtml("Email", data.email) +
      buildDataRowHtml("Telefono", data.phone) +
      buildDataRowHtml("Sexo", data.sex) +
      buildDataRowHtml("Distancia", data.distance) +
      buildDataRowHtml("Categoria", data.category) +
      buildDataRowHtml("Grupo Entrenamiento", data.trainingGroup) +
      buildDataRowHtml("Talle Remera", data.shirtSize) +
      buildDataRowHtml("Valor base de inscripcion", formatMoneyForEmail(data.registrationAmount)) +
      buildDataRowHtml("Descuento aplicado", String(data.discountPercent) + "%") +
      buildDataRowHtml("Valor final a pagar", formatMoneyForEmail(data.finalAmount)) +
      buildDataRowHtml("Adjunta imagen", data.hasAttachment ? "SI" : "NO") +
      buildDataRowHtml("Fecha de registro", data.registrationDateText) +
    "</table>";

  return buildHtmlEmailShell(
    "Nueva pre-inscripcion recibida",
    CONFIG.EVENT_NAME,
    summaryHtml + tableHtml
  );
}

function buildRegistrantHtmlEmail(data) {
  var summaryHtml =
    "<div style='margin-bottom:14px;padding:12px;border-radius:10px;background:#eef4ff;border:1px solid #d6e3ff;'>" +
      "<div style='font-size:13px;color:#385a8d;font-weight:700;'>VALOR FINAL A PAGAR</div>" +
      "<div style='font-size:24px;color:#0f7a32;font-weight:800;'>" + escapeHtml(formatMoneyForEmail(data.finalAmount)) + "</div>" +
      "<div style='margin-top:6px;font-size:13px;color:#385a8d;'>Codigo aplicado: " + escapeHtml(data.discountCode || "Sin codigo") + "</div>" +
    "</div>";

  var tableHtml =
    "<table style='width:100%;border-collapse:collapse;border:1px solid #e7efff;border-radius:10px;overflow:hidden;'>" +
      buildDataRowHtml("Nombre y Apellido", data.fullName) +
      buildDataRowHtml("Fecha de nacimiento", data.birthDate) +
      buildDataRowHtml("Sexo", data.sex) +
      buildDataRowHtml("Distancia", data.distance) +
      buildDataRowHtml("Categoria", data.category) +
      buildDataRowHtml("Grupo de entrenamiento", data.trainingGroup) +
      buildDataRowHtml("Talle de remera", data.shirtSize) +
      buildDataRowHtml("Valor base de inscripcion", formatMoneyForEmail(data.registrationAmount)) +
      buildDataRowHtml("Descuento aplicado", String(data.discountPercent) + "%") +
      buildDataRowHtml("Valor final a pagar", formatMoneyForEmail(data.finalAmount)) +
      buildDataRowHtml("Fecha", data.registrationDateText) +
    "</table>";

  var footerHtml =
    "<p style='margin:14px 0 0;font-size:14px;line-height:1.45;color:#213962;'>" +
      "La informacion y el comprobante adjuntado quedaran sujetos a verificacion por parte de la organizacion.<br/>" +
      "En breve recibira la confirmacion final de su inscripcion por parte del organizador del evento." +
    "</p>" +
    "<p style='margin:14px 0 0;font-size:14px;color:#213962;font-weight:700;'>Club de Gimnasia y Esgrima La Plata</p>";

  return buildHtmlEmailShell(
    "Pre-inscripcion recibida - EL LOBO TE ESPERA",
    "Comprobante de recepcion",
    summaryHtml + tableHtml + footerHtml
  );
}

function getEventImageSrc() {
  if (!CONFIG.IMAGE_DRIVE_FILE_ID) {
    return buildFallbackImageDataUri();
  }
  try {
    var file = resolveDriveFile(CONFIG.IMAGE_DRIVE_FILE_ID);
    var mime = file.getMimeType();
    if (!mime || mime.indexOf("image/") !== 0) {
      Logger.log("IMAGE_DRIVE_FILE_ID no es imagen. mime=" + mime + " name=" + file.getName());
      return buildFallbackImageDataUri();
    }
    var blob = file.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    return "data:" + mime + ";base64," + base64;
  } catch (e) {
    Logger.log("Error getEventImageSrc: " + e);
    return buildFallbackImageDataUri();
  }
}

function resolveDriveFile(fileId) {
  var file = DriveApp.getFileById(fileId);
  var mime = file.getMimeType();

  if (mime === MimeType.SHORTCUT) {
    var targetId = file.getTargetId();
    if (!targetId) {
      throw new Error("El atajo no tiene archivo destino.");
    }
    file = DriveApp.getFileById(targetId);
  }

  return file;
}

function debugImageConfig() {
  var result = {};
  try {
    var file = resolveDriveFile(CONFIG.IMAGE_DRIVE_FILE_ID);
    result.ok = true;
    result.fileId = CONFIG.IMAGE_DRIVE_FILE_ID;
    result.name = file.getName();
    result.mime = file.getMimeType();
    result.size = file.getSize();
  } catch (e) {
    result.ok = false;
    result.fileId = CONFIG.IMAGE_DRIVE_FILE_ID;
    result.error = String(e);
  }
  Logger.log(JSON.stringify(result));
  return result;
}

function buildFallbackImageDataUri() {
  var svg = "";
  svg += "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='700' viewBox='0 0 1200 700'>";
  svg += "<defs><linearGradient id='g' x1='0' x2='1'><stop offset='0%' stop-color='#0d1b3d'/><stop offset='100%' stop-color='#0047ab'/></linearGradient></defs>";
  svg += "<rect width='1200' height='700' fill='url(#g)'/>";
  svg += "<text x='600' y='380' text-anchor='middle' fill='white' font-family='Arial, sans-serif' font-size='56' font-weight='700'>Gimnasia LP</text>";
  svg += "</svg>";
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

function submitRegistration(payload) {
  if (!payload) payload = {};
  if (!CONFIG.DESTINATION_EMAIL || CONFIG.DESTINATION_EMAIL === "tu-email@dominio.com") {
    throw new Error("Configura CONFIG.DESTINATION_EMAIL");
  }

  var fullName = String(payload.fullName || "").trim();
  var document = String(payload.document || "").trim();
  var birthDate = String(payload.birthDate || "").trim();
  var email = String(payload.email || "").trim();
  var phone = String(payload.phone || "").trim();
  var sex = String(payload.sex || "").trim();
  var distance = String(payload.distance || "").trim();
  var category = String(payload.category || "").trim();
  var trainingGroup = String(payload.trainingGroup || "").trim();
  var shirtSize = String(payload.shirtSize || "").trim();
  var discountCode = String(payload.discountCode || "").trim().toUpperCase();
  var attachmentName = String(payload.attachmentName || "").trim();
  var attachmentMime = String(payload.attachmentMime || "").trim();
  var attachmentBase64 = String(payload.attachmentBase64 || "").trim();
  var hasAttachment = false;
  var attachments = [];
  var birthDateObj = null;
  var today = new Date();
  var minBirthDate = new Date("1900-01-01T00:00:00");
  var current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  var registrationCloseDate = new Date(today.getFullYear(), 8, 2);

  if (current >= registrationCloseDate) {
    throw new Error("La pre-inscripcion online finalizo el 1 de septiembre.");
  }

  if (!fullName || !document || !birthDate || !email || !phone || !sex || !distance || !category) {
    throw new Error("Completa todos los campos obligatorios.");
  }
  if (!trainingGroup || !shirtSize) {
    throw new Error("Completa todos los campos obligatorios.");
  }
  if (!attachmentName || !attachmentMime || !attachmentBase64) {
    throw new Error("El adjunto de imagen es obligatorio.");
  }

  fullName = fullName.replace(/\s+/g, " ");
  if (fullName.length < 4 || fullName.split(" ").length < 2) {
    throw new Error("Nombre y apellido invalido.");
  }
  if (!/^\d{6,12}$/.test(document)) {
    throw new Error("Documento invalido.");
  }
  birthDateObj = new Date(birthDate + "T00:00:00");
  if (isNaN(birthDateObj.getTime()) || birthDateObj < minBirthDate || birthDateObj > today) {
    throw new Error("Fecha de nacimiento invalida.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email invalido.");
  }
  if (!/^[+\d\s\-()]{8,20}$/.test(phone)) {
    throw new Error("Telefono invalido.");
  }
  if (trainingGroup.length < 2) {
    throw new Error("Grupo de entrenamiento invalido.");
  }
  var allowedSexes = ["Masculino", "Femenino", "No binario"];
  if (allowedSexes.indexOf(sex) === -1) {
    throw new Error("Selecciona un sexo valido.");
  }
  if (discountCode) {
    if (!/^[A-Z0-9_-]{3,20}$/.test(discountCode)) {
      throw new Error("Codigo de descuento invalido.");
    }
    if (!Object.prototype.hasOwnProperty.call(CONFIG.DISCOUNT_CODES, discountCode)) {
      throw new Error("Codigo de descuento no reconocido.");
    }
  }

  if (distance !== "4 KM (Caminantes)" && distance !== "11 KM") {
    throw new Error("Selecciona una distancia valida.");
  }

  var allowed11 = [
    "A - Hasta 19 Años",
    "B - 20 a 29 Años",
    "C - 30 a 34 Años",
    "D - 35 a 39 Años",
    "E - 40 a 44 Años",
    "F - 45 a 49 Años",
    "G - 50 a 54 Años",
    "H - 55 a 59 Años",
    "I - 60 a 64 Años",
    "J - 65 a 69 Años",
    "K - Mas de 70 Años"
  ];

  if (distance === "4 KM (Caminantes)") {
    category = sex + " - UNICA";
    shirtSize = "Sin Remera";
  } else {
    var allowed11BySex = allowed11.map(function(baseCategory) {
      return sex + " - " + baseCategory;
    });
    if (allowed11BySex.indexOf(category) === -1) {
      throw new Error("Selecciona una categoria valida para 11 KM.");
    }
    if (CONFIG.SHIRT_SIZES.indexOf(shirtSize) === -1) {
      throw new Error("Talle de remera invalido.");
    }
  }

  var discountPercent = discountCode ? CONFIG.DISCOUNT_CODES[discountCode] : 0;
  var registrationAmount = resolveDistancePrice(distance, new Date());
  var finalAmount = applyDiscountToAmount(registrationAmount, discountPercent);
  var birthDateForEmail = formatBirthDateForEmail(birthDate);
  var registrationDateText = new Date().toLocaleString("es-AR");

  if (!attachmentMime || attachmentMime.indexOf("image/") !== 0) {
    throw new Error("Adjunto invalido. Solo imagenes.");
  }
  var bytes = Utilities.base64Decode(attachmentBase64);
  if (bytes.length > 4 * 1024 * 1024) {
    throw new Error("La imagen adjunta supera 4 MB.");
  }
  var safeName = attachmentName || "adjunto.jpg";
  attachments.push(Utilities.newBlob(bytes, attachmentMime, safeName));
  hasAttachment = true;

  var rowData = {
    nombre_apellido: fullName,
    doc: document,
    fecha_nacimiento: birthDate,
    mail: email,
    telefono: phone,
    distancia: distance,
    categoria: category,
    grupo_entrenamiento: trainingGroup,
    talle_remera: shirtSize,
    monto_final: finalAmount
  };
  appendRowIfConfigured(rowData);

  var subject = "Nueva inscripcion - EL LOBO TE ESPERA";
  var body =
    "Nombre y Apellido: " + fullName + "\n" +
    "Doc: " + document + "\n" +
    "Fecha Nacimiento: " + birthDateForEmail + "\n" +
    "Email: " + email + "\n" +
    "Telefono: " + phone + "\n" +
    "Sexo: " + sex + "\n" +
    "Distancia: " + distance + "\n" +
    "Categoria: " + category + "\n" +
    "Grupo Entrenamiento: " + trainingGroup + "\n" +
    "Talle Remera: " + shirtSize + "\n" +
    "Valor base de inscripcion: $" + registrationAmount + "\n" +
    "Codigo Descuento: " + (discountCode || "Sin codigo") + "\n" +
    "Descuento aplicado: " + discountPercent + "%\n" +
    "Valor final a pagar: $" + finalAmount + "\n" +
    "Adjunta imagen: " + (hasAttachment ? "SI" : "NO") + "\n" +
    "Fecha de registro: " + registrationDateText;

  var registrationData = {
    fullName: fullName,
    document: document,
    birthDate: birthDateForEmail,
    email: email,
    phone: phone,
    sex: sex,
    distance: distance,
    category: category,
    trainingGroup: trainingGroup,
    shirtSize: shirtSize,
    discountCode: discountCode,
    discountPercent: discountPercent,
    registrationAmount: registrationAmount,
    finalAmount: finalAmount,
    hasAttachment: hasAttachment,
    registrationDateText: registrationDateText
  };

  var mailOptions = {
    to: CONFIG.DESTINATION_EMAIL,
    subject: subject,
    body: body,
    htmlBody: buildOrganizerHtmlEmail(registrationData),
    name: CONFIG.SENDER_NAME,
    replyTo: CONFIG.PUBLIC_REPLY_TO,
    noReply: CONFIG.USE_NO_REPLY
  };

  if (attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  MailApp.sendEmail(mailOptions);
  sendRegistrantConfirmationEmail(registrationData);

  return {
    ok: true,
    message: "Inscripcion enviada correctamente.",
    discountPercent: discountPercent,
    registrationAmount: registrationAmount,
    finalAmount: finalAmount,
    discountCode: discountCode
  };
}

function sendRegistrantConfirmationEmail(data) {
  if (!data || !data.email) return;

  var subject = "Pre-Inscripcion recibida - EL LOBO TE ESPERA";
  var body =
    "Estimado/a " + data.fullName + ":\n\n" +
    "Hemos recibido correctamente su pre-inscripcion al evento EL LOBO TE ESPERA.\n\n" +
    "Datos registrados:\n" +
    "- Fecha de nacimiento: " + data.birthDate + "\n" +
    "- Sexo: " + data.sex + "\n" +
    "- Distancia: " + data.distance + "\n" +
    "- Categoria: " + data.category + "\n" +
    "- Grupo de entrenamiento: " + data.trainingGroup + "\n" +
    "- Talle de remera: " + data.shirtSize + "\n" +
    "- Valor base de inscripcion: $" + data.registrationAmount + "\n" +
    "- Codigo de descuento: " + (data.discountCode || "Sin codigo") + "\n" +
    "- Descuento aplicado: " + (data.discountPercent || 0) + "%\n" +
    "- Valor final a pagar: $" + data.finalAmount + "\n" +
    "- Fecha: " + data.registrationDateText + "\n\n" +
    "La informacion y el comprobante adjuntado quedaran sujetos a verificacion por parte de la organizacion.\n" +
    "En breve recibira la confirmacion final de su inscripcion por parte del organizador del evento.\n\n" +
    "Atentamente,\n" +
    "Club de Gimnasia y Esgrima La Plata";

  MailApp.sendEmail({
    to: data.email,
    subject: subject,
    body: body,
    htmlBody: buildRegistrantHtmlEmail(data),
    name: CONFIG.SENDER_NAME,
    replyTo: CONFIG.PUBLIC_REPLY_TO,
    noReply: CONFIG.USE_NO_REPLY
  });
}

function appendRowIfConfigured(rowData) {
  if (!CONFIG.SPREADSHEET_ID) return;
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sh = getOrCreateSheetByName(ss, CONFIG.SHEET_NAME);
  var columns = Array.isArray(CONFIG.SHEET_COLUMNS) && CONFIG.SHEET_COLUMNS.length > 0
    ? CONFIG.SHEET_COLUMNS
    : Object.keys(rowData || {});
  ensureSheetHeadersIfNeeded(sh, columns);
  var row = columns.map(function(col) {
    return Object.prototype.hasOwnProperty.call(rowData, col) ? rowData[col] : "";
  });
  sh.appendRow(row);
}

function getOrCreateSheetByName(spreadsheet, sheetName) {
  var target = String(sheetName || "").trim();
  if (!target) {
    throw new Error("CONFIG.SHEET_NAME no puede estar vacio.");
  }

  var exact = spreadsheet.getSheetByName(target);
  if (exact) return exact;

  var normalizedTarget = target.toLowerCase().replace(/\s+/g, " ").trim();
  var sheets = spreadsheet.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var currentName = sheets[i].getName();
    var normalizedCurrent = String(currentName || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (normalizedCurrent === normalizedTarget) {
      return sheets[i];
    }
  }

  return spreadsheet.insertSheet(target);
}

function ensureSheetHeadersIfNeeded(sheet, headers) {
  if (sheet.getLastRow() > 0) return;
  var labels = headers.map(function(header) {
    if (CONFIG.SHEET_COLUMN_LABELS && CONFIG.SHEET_COLUMN_LABELS[header]) {
      return CONFIG.SHEET_COLUMN_LABELS[header];
    }
    return header;
  });
  sheet.appendRow(labels);
}

function testSubmitRegistration() {
  var payload = {
    fullName: "Juan Perez",
    document: "30123456",
    birthDate: "1990-05-15",
    email: "desafiodellobo@gmail.com",
    phone: "+54 9 221 555-1234",
    sex: "Masculino",
    distance: "11 KM",
    category: "Masculino - B - 20 a 29 Años",
    trainingGroup: "Diego Simon Trail Running",
    shirtSize: "M",
    discountCode: "",
    attachmentName: "comprobante-test.png",
    attachmentMime: "image/png",
    attachmentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6p8f8AAAAASUVORK5CYII="
  };

  var result = submitRegistration(payload);
  Logger.log(JSON.stringify(result));
  return result;
}
