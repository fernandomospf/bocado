import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Política de Privacidade' };

const CONTACT = 'fernandomosp@gmail.com';

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="13 de novembro de 2026">
      <p>
        Esta política explica, em linguagem simples, quais dados o Bocado coleta, para que eles são usados e quais são
        os seus direitos, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
      </p>

      <h2>1. Quem somos</h2>
      <p>
        O Bocado é um app pessoal de contagem de calorias e macronutrientes, operado por Fernando, que é o responsável
        (controlador) pelos dados tratados aqui. Para qualquer assunto sobre privacidade, escreva para{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2>2. Dados que coletamos</h2>
      <h3>Conta</h3>
      <p>
        No cadastro com e-mail: nome, e-mail e senha. A senha nunca é guardada como foi digitada, só como um hash
        bcrypt, que não permite recuperar a senha original.
      </p>
      <p>
        No login com Google: nome, e-mail, o link da sua foto de perfil e o identificador da sua conta Google. Usamos
        apenas os escopos <code>openid</code>, <code>email</code> e <code>profile</code>. Nada além disso é acessado na
        sua conta Google: nada de contatos, arquivos, agenda ou e-mails. A foto não é copiada para o nosso servidor;
        guardamos só o link, e a imagem é carregada diretamente dos servidores do Google quando aparece no app.
      </p>
      <h3>Questionário</h3>
      <p>
        Sexo biológico, data de nascimento, altura, peso, nível de atividade e objetivo. Esses dados servem só para
        calcular suas metas de calorias e macronutrientes, que também ficam guardadas.
      </p>
      <h3>Refeições</h3>
      <p>
        Data e tipo da refeição, alimentos, porções e nutrientes que você registra, além de uma observação, se você
        escrever uma.
      </p>
      <p>
        Peso, altura e hábitos alimentares podem ser considerados dados de saúde pela LGPD. Eles são tratados com base
        no seu consentimento, dado ao preenchê-los, e usados apenas para as finalidades descritas aqui.
      </p>

      <h2>3. Fotos e descrições de refeições</h2>
      <p>
        Quando você usa a análise por foto ou por descrição, a imagem ou o texto é enviado à API da Anthropic (Claude),
        apenas para estimar os alimentos e nutrientes. As fotos não são armazenadas pelo Bocado: elas são usadas na
        análise e descartadas. Só fica salvo o que você confirmar ao registrar a refeição.
      </p>
      <p>
        Segundo a política da Anthropic para a API, os dados enviados não são usados para treinar os modelos dela. O
        processamento acontece nos servidores da Anthropic, que podem ficar fora do Brasil. Veja a{' '}
        <a href="https://www.anthropic.com/legal/privacy" target="_blank" rel="noopener noreferrer">
          política de privacidade da Anthropic
        </a>
        .
      </p>
      <p>
        Para corrigir erros, os registros técnicos do servidor (logs) podem guardar a estimativa devolvida pela IA, ou
        seja, nomes de alimentos e números de nutrientes. Fotos nunca vão para esses registros.
      </p>

      <h2>4. Para que usamos os dados</h2>
      <p>
        Exclusivamente para fazer o app funcionar: manter sua conta, calcular suas metas, mostrar seu histórico e
        estimar refeições. Não há anúncios. Não vendemos nem compartilhamos seus dados com terceiros, exceto o
        processamento pela Anthropic descrito acima.
      </p>

      <h2>5. Cookies</h2>
      <p>
        Usamos apenas cookies essenciais, do tipo httpOnly, que não podem ser lidos por scripts da página:
      </p>
      <ul>
        <li>um cookie de sessão, que mantém você conectado por até 30 dias ou até você sair da conta;</li>
        <li>
          no login com Google, um cookie temporário de segurança, válido por 10 minutos, que protege o retorno do Google
          contra fraudes.
        </li>
      </ul>
      <p>Não usamos cookies de rastreamento, publicidade ou analytics.</p>

      <h2>6. Armazenamento e segurança</h2>
      <p>
        Os dados ficam em um banco PostgreSQL em servidor próprio. Todo o acesso ao app é feito por HTTPS, as senhas são
        guardadas com hash e a sessão fica em cookie httpOnly. Nenhum sistema é totalmente imune a falhas, mas adotamos
        essas medidas para proteger suas informações.
      </p>

      <h2>7. Seus direitos</h2>
      <p>
        Pela LGPD, você pode, entre outros direitos, confirmar se tratamos seus dados, acessá-los, corrigi-los e pedir a
        exclusão. Boa parte dos dados pode ser corrigida no próprio app, em Perfil.
      </p>
      <p>
        Ainda não existe um botão para excluir a conta. Para isso, ou para qualquer outro pedido, escreva para{' '}
        <a href={`mailto:${CONTACT}`}>{CONTACT}</a> a partir do e-mail da sua conta. O pedido é atendido em até 15
        dias. A exclusão apaga a conta, o questionário e todas as refeições registradas.
      </p>
      <p>
        Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>8. Alterações e contato</h2>
      <p>
        Esta política pode ser atualizada quando o app mudar. A data no topo indica a versão atual, e mudanças
        importantes serão avisadas no app. Dúvidas: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
