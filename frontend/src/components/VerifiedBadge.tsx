import { VerifiedIcon } from './Icons';

/** Selo "Verificado": 2 ou mais pessoas diferentes confirmaram que os valores conferem com o rótulo. */
export function VerifiedBadge() {
  return (
    <span className="badge badge-verified">
      <VerifiedIcon width={13} height={13} />
      Verificado
    </span>
  );
}
