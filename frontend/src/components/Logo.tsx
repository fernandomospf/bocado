/** Marca: três anéis abertos, nas cores dos macros. */
export function Logo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="27" fill="none" stroke="#ff4f4a" strokeWidth="7" strokeLinecap="round" strokeDasharray="130 200" transform="rotate(-90 32 32)" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#3f6dff" strokeWidth="7" strokeLinecap="round" strokeDasharray="80 200" transform="rotate(-90 32 32)" />
      <circle cx="32" cy="32" r="9" fill="none" stroke="#12b8a6" strokeWidth="7" strokeLinecap="round" strokeDasharray="42 200" transform="rotate(-90 32 32)" />
    </svg>
  );
}
