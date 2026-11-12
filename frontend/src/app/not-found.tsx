import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="screen screen-plain screen-center">
      <div className="card glass stack" style={{ textAlign: 'center' }}>
        <h1 className="title">Página não encontrada</h1>
        <p className="body-2">O endereço pode ter mudado.</p>
        <Link href="/" className="btn btn-primary">
          Ir para hoje
        </Link>
      </div>
    </main>
  );
}
