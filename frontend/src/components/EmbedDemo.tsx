import Script from 'next/script';

/**
 * Publications Instagram et TikTok intégrées : les blockquotes officielles sont dans le HTML initial (rendu serveur), le script public
 * de chaque réseau les habille ensuite. Le robot de Meta (revue « oEmbed Read ») lit le HTML brut : il doit y trouver les permaliens.
 */
export default function EmbedDemo({ urls }: { urls: string[] }) {
  const isTiktok = (u: string) => /tiktok\.com/i.test(u);
  return (
    <>
      <div data-testid="embed-demo" className="grid md:grid-cols-2 gap-6 items-start">
        {urls.map((u) => isTiktok(u) ? (
          <blockquote key={u} className="tiktok-embed" cite={u} data-video-id={(u.match(/video\/(\d+)/) || [])[1] || ''} style={{ maxWidth: 605, minWidth: 325, margin: '0 auto 24px' }}>
            <section><a href={u} target="_blank" rel="noopener noreferrer">{u}</a></section>
          </blockquote>
        ) : (
          <blockquote key={u} className="instagram-media" data-instgrm-captioned data-instgrm-permalink={u} data-instgrm-version="14" style={{ maxWidth: 540, minWidth: 326, width: '100%', margin: '0 auto 24px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 0 }}>
            <a href={u} target="_blank" rel="noopener noreferrer" style={{ display: 'block', padding: 16 }}>Voir cette publication sur Instagram</a>
          </blockquote>
        ))}
      </div>
      <ul className="mt-6 text-sm text-neutral-600 flex flex-wrap gap-x-6 gap-y-1 justify-center" aria-label="Publications affichées">
        {urls.map((u) => <li key={u}><a href={u} target="_blank" rel="noopener noreferrer" className="text-primary-700 underline break-all">{u}</a></li>)}
      </ul>
      {urls.some(u => !isTiktok(u)) && <Script src="https://www.instagram.com/embed.js" strategy="afterInteractive" />}
      {urls.some(isTiktok) && <Script src="https://www.tiktok.com/embed.js" strategy="afterInteractive" />}
    </>
  );
}
