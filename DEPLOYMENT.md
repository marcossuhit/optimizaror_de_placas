# Deploy en VPS Ubuntu 24.04

Esta guía agrega Optimizador como sitio independiente. No requiere cambiar el virtual host de Acrobacias: cada dominio debe tener su propio bloque `server` de Nginx. El sitio de Optimizador se sirve como archivos estáticos; el único proceso Node dedicado es el endpoint de correo.

## Requisitos previos

- Un dominio nuevo, con los registros DNS `A` (y `AAAA` si corresponde) apuntando a la IP del VPS.
- Acceso SSH con permisos para instalar paquetes y configurar Nginx.
- Credenciales SMTP de una cuenta técnica del proveedor de correo; no se necesita vincular una cuenta personal de Google.
- Una cuenta técnica SMTP del proveedor. Los usuarios de la aplicación no necesitan configurar SMTP ni tener una cuenta real de Google.

## Preparar archivos

Generá un archivo comprimido desde la carpeta del proyecto, excluyendo dependencias y repositorio:

```bash
tar --exclude=.git --exclude=node_modules --exclude=debug --exclude='test-*' \
  -czf optimizador-deploy.tar.gz .
```

Copialo al VPS y extraelo en una carpeta de release bajo `/var/www/optimizador/`. El `root` de Nginx debe apuntar a la carpeta que contiene `index.html`. En esa ubicación, instalá la dependencia del proceso de correo con `npm install --omit=dev`.

## Servicio de correo

Creá `/etc/optimizador.env` en el VPS, asignalo al usuario que ejecutará el servicio y restringí sus permisos (`chmod 600`). No subas este archivo al repositorio ni lo incluyas en el paquete:

```dotenv
HOST=127.0.0.1
PORT=4010
OPTIMIZADOR_ALLOWED_ORIGIN=https://TU_DOMINIO,https://www.TU_DOMINIO
EMAIL_ADMIN_RECIPIENT=fernandofreireadrian@gmail.com
SMTP_HOST=smtp.tu-proveedor.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=usuario-smtp-de-la-cuenta-tecnica
SMTP_PASS=credencial-smtp-del-proveedor
SMTP_FROM=no-reply@tu-dominio
SMTP_FROM_NAME=Optimizador de Placas
GOOGLE_CLIENT_ID=44432976099-rhvil13l9qgtjfq3u4ivh6btt1o1nfgg.apps.googleusercontent.com
MATERIAL_IMAGE_ADMIN_EMAILS=marcossuhit@gmail.com,fernandofreireadrian@gmail.com
MATERIAL_IMAGE_STORAGE_DIR=/var/lib/optimizador/material-images
```

El correo administrativo siempre se entrega a `EMAIL_ADMIN_RECIPIENT`. Además, se envía una copia sin precios al email de la sesión, con el destinatario administrativo en copia oculta. El servidor no permite quitar esa copia administrativa.

El `From` y el nombre salen exclusivamente de variables del servidor; el navegador no puede elegirlos. `SMTP_FROM` debe ser un remitente aceptado/verificado por el proveedor. Puede ser una dirección `no-reply` sin buzón de recepción, siempre que el proveedor autorice ese remitente o dominio. `SMTP_USER` y `SMTP_PASS` son credenciales del servicio de correo, no de los usuarios de Optimizador.

`EMAIL_ADMIN_RECIPIENT` se configura en el servidor como `fernandofreireadrian@gmail.com`; no hace falta añadir emails de usuarios a ninguna lista. El login manual no verifica que la dirección declarada pertenezca a quien la usa; con Google OAuth se utiliza el email devuelto por Google.

Las imágenes se guardan fuera de la carpeta de releases, en `/var/lib/optimizador/material-images`. Creá el directorio antes de iniciar el servicio para que Node pueda escribirlo:

```bash
install -d -o www-data -g www-data -m 0750 /var/lib/optimizador/material-images
```

`GOOGLE_CLIENT_ID` debe coincidir con el cliente usado por `auth.js`. El backend verifica la firma, audiencia y expiración del ID token y solo permite subir o borrar a las direcciones incluidas en `MATERIAL_IMAGE_ADMIN_EMAILS`; separalas por coma. Esa lista es deliberadamente independiente de la lista editable del back office. Los usuarios con login manual pueden seguir usando la app, pero no modificar imágenes remotas. La lectura de imágenes es pública para que los clientes vean el popup.

`OPTIMIZADOR_ALLOWED_ORIGIN` acepta uno o varios orígenes separados por coma. Si Nginx sirve el sitio en el dominio raíz y en `www`, ambos deben figurar exactamente, sin barras finales.

Incluí `/var/lib/optimizador/material-images` en los backups persistentes del VPS y probá restaurar el directorio. No está dentro del tarball ni de la carpeta de releases. Los cambios de imagen reemplazan el archivo del material; quitar una imagen lo elimina. Las imágenes que ya existían en `localStorage` deben volver a cargarse manualmente.

Copiá `deploy/systemd/optimizador-mail.service.example` a `/etc/systemd/system/optimizador-mail.service`. Confirmá que `www-data` pueda leer la carpeta del proyecto y que `/etc/optimizador.env` tenga permisos `600`; systemd carga ese archivo como root. Ejecutá `systemctl daemon-reload`, `systemctl enable --now optimizador-mail` y revisá `systemctl status optimizador-mail`. El proceso escucha únicamente en `127.0.0.1:4010`; no abras ese puerto en el firewall.

## Nginx y HTTPS

Copiá `deploy/nginx/optimizador.conf.example` a `sites-available`, reemplazá `TU_DOMINIO` y habilitalo con un enlace en `sites-enabled`. Validá con `nginx -t` antes de recargar Nginx. La ruta `/api/send-email` se deriva al servicio local; los archivos restantes se sirven desde el directorio estático.

Instalá también el proxy de imágenes incluido en `deploy/nginx/material-images-location.conf` como `/etc/nginx/snippets/optimizador-material-images.conf`; el vhost de ejemplo ya incluye ese snippet. La ruta `/api/material-images` se deriva al servicio Node. Las consultas y archivos son públicos; los métodos de subida y borrado requieren un ID token Google válido y la allowlist del servidor. No abras el puerto `4010` hacia Internet.

Una vez que el DNS resuelva al VPS y Nginx esté recargado, emití el certificado para el nuevo dominio con Certbot usando el plugin de Nginx. Verificá que Acrobacias siga respondiendo desde su dominio y que el dominio nuevo cargue Optimizador. No cambies ni reemplaces el bloque existente de Acrobacias.

## Verificación

- `npm run test:api` ejecuta las pruebas locales de carga, reemplazo, lectura pública, borrado y autorización.
- `https://TU_DOMINIO/` carga Optimizador.
- `https://TU_DOMINIO/health` devuelve `{"status":"ok"}`.
- `https://TU_DOMINIO/api/material-images?material=MDF%20Blanco` devuelve `{"imageUrl":null}` cuando todavía no hay foto.
- Una cuenta Google en `MATERIAL_IMAGE_ADMIN_EMAILS` puede subir una imagen desde BackOffice y un cliente sin login puede abrir su URL pública.
- Una sesión manual, un token Google vencido o un correo fuera de la allowlist no pueden subir ni borrar imágenes.
- Una llamada al endpoint desde otro `Origin` devuelve `403`.
- Una solicitud a un usuario incluye siempre `fernandofreireadrian@gmail.com` en copia oculta.
- El inicio de sesión con Google puede requerir agregar el nuevo origen y URI de callback en la configuración OAuth de Google.