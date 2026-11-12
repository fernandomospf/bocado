/* eslint-disable @next/next/no-img-element */
interface AvatarProps {
  name: string;
  url?: string | null;
  large?: boolean;
}

export function Avatar({ name, url, large }: AvatarProps) {
  const className = large ? 'avatar avatar-lg' : 'avatar';
  if (url) return <img src={url} alt="" className={className} referrerPolicy="no-referrer" />;
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className={className} aria-hidden>
      {initials || '•'}
    </span>
  );
}
