/** Escapa texto vindo de usuario antes de entrar no HTML do e-mail. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface EmailLayout {
  appName: string;
  title: string;
  /** Paragrafos ja escapados (ou HTML confiavel montado aqui no backend). */
  paragraphs: string[];
  action?: { label: string; url: string };
  footer?: string;
}

/**
 * Layout unico dos e-mails. Tabelas e estilo inline de proposito: clientes de
 * e-mail (Outlook, Gmail) ignoram <style> e boa parte do CSS moderno.
 */
export function renderEmail({
  appName,
  title,
  paragraphs,
  action,
  footer,
}: EmailLayout): string {
  const button = action
    ? `<tr><td style="padding:8px 0 24px">
         <a href="${escapeHtml(action.url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600">${escapeHtml(action.label)}</a>
       </td></tr>
       <tr><td style="padding:0 0 24px;color:#777;font-size:13px">
         Se o botao nao funcionar, copie e cole este endereco no navegador:<br>
         <span style="word-break:break-all">${escapeHtml(action.url)}</span>
       </td></tr>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:10px;padding:32px">
          <tr><td style="font-size:14px;font-weight:700;letter-spacing:.02em;padding-bottom:24px">${escapeHtml(appName)}</td></tr>
          <tr><td style="font-size:22px;font-weight:700;padding-bottom:16px">${escapeHtml(title)}</td></tr>
          ${paragraphs.map((p) => `<tr><td style="font-size:15px;line-height:1.6;padding-bottom:16px">${p}</td></tr>`).join('')}
          ${button}
          ${footer ? `<tr><td style="border-top:1px solid #eee;padding-top:16px;color:#999;font-size:12px">${footer}</td></tr>` : ''}
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
