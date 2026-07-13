# Olukotan Web Companion

The web companion is an installable progressive web app for phones, tablets, Chromebooks, macOS, Linux and Windows. It keeps an offline browser copy in IndexedDB and can explicitly synchronise Olukotan-created files with Google Drive.

## Privacy model

- A project is saved locally before any network sync is attempted.
- Drive access is optional and initiated with the **Connect Drive** button.
- The app requests the narrow `drive.file` scope, not access to every file in Drive.
- OAuth access tokens remain in memory and expire; they are not stored in project files.
- Drive conflicts stop uploads. A newer remote copy requires confirmation before replacing the offline copy.
- Fountain remains downloadable as an ordinary UTF-8 file.

## Build

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run test:pwa
```

Deploy the contents of `dist` to the root of any static HTTPS host. The build uses relative asset paths and can also be served from a subdirectory.

## Configure Google Drive

1. In Google Cloud Console, create or select a project.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen.
4. Create an OAuth 2.0 Client ID of type **Web application**.
5. Add the deployed site's exact HTTPS origin under **Authorised JavaScript origins**. For local testing, add `http://localhost:4173`.
6. In Olukotan Web, open **Settings**, paste the client ID, enable explicit Drive sync, save, and select **Connect Drive**.

No client secret belongs in the browser application. Google documents this browser token model at <https://developers.google.com/identity/oauth2/web/guides/use-token-model> and the narrow Drive scope at <https://developers.google.com/workspace/drive/api/guides/api-specific-auth>.

## Hosting requirement

Phone/tablet access from anywhere requires a stable public HTTPS address. Static hosting does not need a database or application server. Google Drive provides the optional cross-device file transport after the OAuth origin is registered.

## Current limitations

- Hosting and Google Cloud OAuth configuration require the owner's account and cannot be completed anonymously.
- Drive access must be renewed after the short-lived browser token expires.
- The PWA currently synchronises the manifest and primary Fountain screenplay; attachments and supporting documents follow in a later milestone.
- Safari/iOS may evict offline browser storage under device pressure, so Drive sync or regular Fountain downloads are recommended.
