import { ImageResponse } from 'next/og';

export const alt = 'Bocado: contagem de calorias para a comida brasileira';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Cartão de compartilhamento: fundo escuro, os três anéis da marca e o nome. Sem imagens externas. */
export default function OpenGraphImage() {
  const ring = (r: number, color: string, dash: number) => (
    <circle cx="150" cy="150" r={r} fill="none" stroke={color} strokeWidth="26" strokeLinecap="round" strokeDasharray={`${dash} 2000`} transform="rotate(-90 150 150)" />
  );
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: '0 90px',
          background: 'linear-gradient(135deg, #060a14 0%, #0d1730 55%, #0b2a2a 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <svg width="300" height="300" viewBox="0 0 300 300">
          {ring(124, '#ff4f4a', 560)}
          {ring(84, '#3f6dff', 330)}
          {ring(44, '#12b8a6', 170)}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 70 }}>
          <div style={{ fontSize: 108, fontWeight: 800, letterSpacing: -2 }}>Bocado</div>
          <div style={{ fontSize: 38, marginTop: 14, color: 'rgba(255,255,255,0.78)', maxWidth: 640, lineHeight: 1.25 }}>
            Contar calorias sem complicar, do jeito que a gente come no Brasil.
          </div>
          <div style={{ marginTop: 28, fontSize: 28, color: '#9cc3ff' }}>Beta fechado, por convite</div>
        </div>
      </div>
    ),
    size,
  );
}
