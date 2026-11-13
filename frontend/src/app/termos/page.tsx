import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Termos de Uso' };

const CONTACT = 'fernandomosp@gmail.com';

export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="13 de novembro de 2026">
      <h2>1. Aceitação</h2>
      <p>
        Ao criar uma conta ou usar o Bocado, você concorda com estes Termos de Uso e com a{' '}
        <Link href="/privacidade">Política de Privacidade</Link>. Se não concordar, não use o app.
      </p>

      <h2>2. O que é o Bocado</h2>
      <p>
        O Bocado é uma ferramenta de acompanhamento pessoal de calorias e macronutrientes. As estimativas, inclusive as
        geradas por inteligência artificial a partir de fotos ou descrições, são aproximadas e podem conter erros.
      </p>
      <p>
        <strong>O Bocado não substitui a orientação de um nutricionista ou médico.</strong> Não use o app como base única
        para decisões de saúde, dietas restritivas ou tratamento de qualquer condição.
      </p>

      <h2>3. Suas responsabilidades</h2>
      <p>
        Você é responsável pelas informações que insere no app e por manter sua senha em segredo. Se suspeitar de
        acesso indevido à sua conta, troque a senha e avise pelo e-mail de contato.
      </p>

      <h2>4. Uso adequado</h2>
      <p>É proibido:</p>
      <ul>
        <li>abusar do serviço ou usá-lo para fins ilegais;</li>
        <li>tentar acessar dados de outros usuários ou partes do sistema sem autorização;</li>
        <li>sobrecarregar a análise por IA, por exemplo com envios automatizados ou em massa.</li>
      </ul>
      <p>Contas que violarem estas regras podem ser suspensas ou encerradas.</p>

      <h2>5. Disponibilidade</h2>
      <p>
        O Bocado é um projeto pessoal, oferecido &ldquo;como está&rdquo;. Não há garantia de disponibilidade contínua,
        de ausência de erros ou de que o serviço continuará existindo. Funcionalidades podem mudar ou ser removidas.
      </p>

      <h2>6. Encerramento</h2>
      <p>
        Você pode parar de usar o app e pedir a exclusão da sua conta a qualquer momento, pelo e-mail{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Os dados são apagados conforme a Política de Privacidade.
      </p>

      <h2>7. Lei aplicável</h2>
      <p>Estes termos são regidos pelas leis da República Federativa do Brasil.</p>

      <h2>8. Contato</h2>
      <p>
        Dúvidas sobre estes termos: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
