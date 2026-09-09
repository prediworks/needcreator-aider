import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05ddb2', borderRadius: 40 }}>
        <svg width="112" height="112" viewBox="0 0 64 64">
          <path d="M25 19.5v25a2 2 0 0 0 3.05 1.7l20-12.5a2 2 0 0 0 0-3.4l-20-12.5A2 2 0 0 0 25 19.5z" fill="#ffffff" />
        </svg>
      </div>
    ),
    size
  );
}
