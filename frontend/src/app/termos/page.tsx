import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  robots: { index: true, follow: true },
};

const CONTACT = 'fernandomosp@gmail.com';

export default function TermsPage() {
  return (
    <LegalPage
      title="Termos de Uso"
      updatedAt="15 de novembro de 2026"
      otherPage={{ href: '/privacidade', label: 'Política de Privacidade' }}
    >
      <h2>1. Aceitação</h2>
      <p>
        Ao criar uma conta ou entrar no Bocado, você concorda com estes Termos de Uso e com a{' '}
        <Link href="/privacidade">Política de Privacidade</Link>. Se não concordar, não use o app.
      </p>

      <h2>2. O que é o Bocado</h2>
      <p>
        O Bocado é uma ferramenta de acompanhamento pessoal de calorias e macronutrientes. As estimativas, inclusive as
        geradas por inteligência artificial a partir de fotos ou descrições, são aproximadas e podem conter erros. As
        metas são sugestões calculadas por fórmulas conhecidas.
      </p>
      <p>
        <strong>O Bocado não substitui a orientação de um nutricionista ou médico.</strong> Se você tem alguma condição de
        saúde, está grávida, é menor de idade ou tem histórico de transtorno alimentar, procure um profissional antes de
        seguir qualquer meta. Não use o app como base única para decisões de saúde ou dietas restritivas.
      </p>

      <h2>3. Conta e responsabilidade</h2>
      <p>
        Informe dados verdadeiros, mantenha sua senha em segredo e use a conta apenas para você: uma conta por pessoa. Se
        suspeitar de acesso indevido, troque a senha e avise pelo e-mail de contato.
      </p>

      <h2>4. Uso adequado</h2>
      <p>É proibido:</p>
      <ul>
        <li>abusar do serviço ou usá-lo para fins ilegais;</li>
        <li>tentar acessar dados de outras pessoas ou partes do sistema sem autorização;</li>
        <li>sobrecarregar a análise por IA, por exemplo com envios automatizados ou em massa (existem limites de uso);</li>
        <li>inserir no acervo compartilhado de produtos conteúdo ilegal ou dados que você sabe que são falsos.</li>
      </ul>

      <h2>5. Conteúdo do usuário</h2>
      <p>
        Os dados que você registra continuam sendo seus. Você autoriza o Bocado a processá-los para prestar o serviço,
        como descrito na Política de Privacidade. Os produtos que você cadastra no acervo compartilhado podem ser usados
        por outros usuários.
      </p>

      <h2>6. Disponibilidade</h2>
      <p>
        O Bocado é um projeto mantido por uma pessoa e oferecido &ldquo;como está&rdquo;. Não há garantia de
        disponibilidade contínua, de ausência de erros ou de que o serviço continuará existindo, e os recursos podem
        mudar ou ser removidos. Se algum dia houver recursos pagos, eles serão informados com preço claro antes de
        qualquer cobrança.
      </p>

      <h2>7. Encerramento</h2>
      <p>
        Você pode excluir sua conta a qualquer momento, em Perfil &gt; Excluir conta, ou pedindo por e-mail para{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Os dados são apagados conforme a Política de Privacidade. Contas que
        violarem estes termos podem ser suspensas ou encerradas.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        Nos limites da lei, o Bocado não responde por decisões de saúde ou de alimentação tomadas com base nas
        estimativas e metas exibidas no app.
      </p>

      <h2>9. Lei aplicável e contato</h2>
      <p>
        Estes termos são regidos pelas leis da República Federativa do Brasil, e qualquer disputa será resolvida no foro
        brasileiro competente. Contato: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
