'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Faixa do topo (área do relógio/notch + 12px). No topo da página fica transparente, sem blur, para não apagar
 * o que está embaixo ("Seu dia"); depois de rolar mais de 8px vira um vidro leve, para o conteúdo que passa por
 * baixo da barra de status continuar legível.
 *
 * A rolagem é detectada com IntersectionObserver num sentinela de 8px no topo do documento, sem listener de scroll.
 */
export function TopBar() {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} className="scroll-sentinel" aria-hidden />
      <div className="top-bar" data-scrolled={scrolled || undefined} aria-hidden />
    </>
  );
}
