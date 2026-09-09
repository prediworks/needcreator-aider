import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'NeedCreator : plateforme UGC pour marques et créateurs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: 'linear-gradient(135deg, #e6fbf6 0%, #ffffff 60%)', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: '#05ddb2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="44" height="44" viewBox="0 0 64 64"><path d="M25 19.5v25a2 2 0 0 0 3.05 1.7l20-12.5a2 2 0 0 0 0-3.4l-20-12.5A2 2 0 0 0 25 19.5z" fill="#fff" /></svg>
          </div>
          <div style={{ fontSize: 48, fontWeight: 700, color: '#171717' }}>NeedCreator</div>
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, color: '#171717', lineHeight: 1.1, maxWidth: 1000 }}>
          Des vidéos UGC authentiques, sans friction
        </div>
        <div style={{ fontSize: 30, color: '#525252', marginTop: 28, maxWidth: 1000 }}>
          Brief en 5 minutes, créateurs vérifiés, paiement à la validation. Commission unique de 10 %.
        </div>
      </div>
    ),
    size
  );
}
