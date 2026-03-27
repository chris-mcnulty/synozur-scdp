const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.co.in', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.de', 'hotmail.es', 'hotmail.it',
  'outlook.com', 'outlook.co.uk', 'outlook.fr',
  'live.com', 'live.co.uk', 'live.fr',
  'msn.com',
  'aol.com', 'aol.co.uk',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'protonmail.ch', 'pm.me',
  'zoho.com',
  'mail.com',
  'inbox.com',
  'yandex.com', 'yandex.ru',
  'tutanota.com', 'tuta.io',
  'fastmail.com', 'fastmail.fm',
  'gmx.com', 'gmx.net', 'gmx.de',
  'web.de',
  'qq.com', '163.com', '126.com',
  'naver.com',
  'rediffmail.com',
]);

export function isPublicEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return PUBLIC_EMAIL_DOMAINS.has(domain);
}
