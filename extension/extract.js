/**
 * Runs inside the open tab. Returns a reduced view of the page: title, visible text (capped), links, and a block signal
 * when the page is a login wall, a captcha, or a restriction notice. No clicks, no form submits, no engagement.
 */
(() => {
  const MAX_TEXT = 20000;
  const MAX_LINKS = 400;
  const url = location.href;
  const bodyText = (document.body?.innerText || '').replace(/[ \t ]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  const lower = (document.title + '\n' + bodyText.slice(0, 3000)).toLowerCase();
  let blocked = null;
  const path = location.pathname;
  const hasLoginForm = !!document.querySelector('input[type="password"]');
  if (/\/accounts\/login|\/login\b|\/checkpoint\//.test(path) || (hasLoginForm && bodyText.length < 4000)) blocked = 'login';
  else if (/^consent\./.test(location.hostname) || /before you continue|avant d.accéder|accept all|tout accepter|bevor sie.*fortfahren/.test(lower) && document.querySelector('form[action*="consent"], button[aria-label*="ccept"]')) blocked = 'consent';
  else if (/captcha|verify you are human|confirm you're human|prouvez que vous êtes humain|vérification de sécurité/.test(lower) || document.querySelector('iframe[src*="captcha"], iframe[src*="challenge"]')) blocked = 'captcha';
  else if (/we restrict certain activity|nous limitons certaines activités|try again later|réessayez plus tard|temporarily blocked|temporairement bloqué|suspicious activity|activité suspecte|something went wrong|une erreur s.est produite/.test(lower) && bodyText.length < 2500) blocked = 'restricted';
  const seen = new Set();
  const links = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href;
    if (!href || !/^https?:|^mailto:/i.test(href) || seen.has(href)) continue;
    seen.add(href);
    links.push({ href: href.slice(0, 500), text: (a.innerText || a.getAttribute('aria-label') || a.title || '').replace(/\s+/g, ' ').trim().slice(0, 120) });
    if (links.length >= MAX_LINKS) break;
  }
  return { url, finalUrl: url, title: document.title || '', text: bodyText.slice(0, MAX_TEXT), links, blocked, scrollHeight: document.documentElement.scrollHeight };
})();
