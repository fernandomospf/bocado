import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Política de Privacidade',
  robots: { index: true, follow: true },
};

const CONTACT = 'fernandomosp@gmail.com';

const TOC = [
  { id: 'quem-somos', label: '1. Quem somos' },
  { id: 'dados', label: '2. Dados que coletamos' },
  { id: 'ia', label: '3. Fotos e descrições (IA)' },
  { id: 'codigo-de-barras', label: '4. Código de barras e acervo de produtos' },
  { id: 'casa', label: '5. Casa e compartilhamento' },
  { id: 'finalidade', label: '6. Para que usamos os dados' },
  { id: 'cookies', label: '7. Cookies' },
  { id: 'seguranca', label: '8. Armazenamento e segurança' },
  { id: 'retencao', label: '9. Por quanto tempo guardamos' },
  { id: 'direitos', label: '10. Seus direitos' },
  { id: 'criancas', label: '11. Crianças e adolescentes' },
  { id: 'alteracoes', label: '12. Alterações e contato' },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Política de Privacidade"
      updatedAt="19 de novembro de 2026"
      toc={TOC}
      otherPage={{ href: '/termos', label: 'Termos de Uso' }}
    >
      <p>
        Esta política explica, em linguagem simples, quais dados o Bocado coleta, para que eles são usados e quais são
        os seus direitos, de acordo com a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
      </p>

      <h2 id="quem-somos">1. Quem somos</h2>
      <p>
        O Bocado é um app pessoal de contagem de calorias e macronutrientes, mantido por Fernando, que é o responsável
        (controlador) pelos dados tratados aqui. Contato: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>

      <h2 id="dados">2. Dados que coletamos</h2>
      <h3>Conta</h3>
      <p>
        No cadastro com e-mail: nome, e-mail e senha. A senha nunca é guardada como foi digitada, só como um hash
        bcrypt, que não permite recuperar a senha original.
      </p>
      <p>
        No login com Google: nome, e-mail, o link da sua foto de perfil e o identificador da sua conta Google. Usamos
        apenas os escopos <code>openid</code>, <code>email</code> e <code>profile</code>, e nada além disso: não
        acessamos contatos, arquivos, agenda nem e-mails. A foto não é copiada para o nosso servidor; guardamos só o
        link, e a imagem é carregada direto dos servidores do Google.
      </p>
      <p>
        O uso das informações recebidas das APIs do Google segue a Política de Dados do Usuário dos Serviços de API do
        Google, incluindo os requisitos de Uso Limitado.
      </p>
      <h3>Perfil e metas</h3>
      <p>
        Sexo biológico, data de nascimento, altura, peso, nível de atividade e objetivo, usados para calcular suas metas
        de calorias e macronutrientes. As metas também ficam guardadas, junto com o primeiro dia da semana que você
        escolher.
      </p>
      <h3>Refeições, alimentos e receitas</h3>
      <p>
        Data e tipo de cada refeição, os alimentos, porções e nutrientes que você registra, uma observação (se você
        escrever uma) e se os valores foram estimados pela IA. Também ficam guardados os alimentos que você cadastra e as
        receitas que você cria, com seus ingredientes.
      </p>
      <h3>Lista de espera e convite do beta</h3>
      <p>
        O Bocado está em beta fechado. Quem entra na lista de espera informa o e-mail e, se quiser, o nome, e marca o
        consentimento. Esses dados são usados só para enviar o convite. Não guardamos IP nem user-agent, e não usamos
        rastreadores. Ao criar a conta com um convite, o app registra qual convite foi usado (e por qual conta) e marca a
        pessoa como tendo entrado. O código de convite é um código de acesso, não identifica ninguém por si só.
      </p>

      <h3>Peso</h3>
      <p>Os registros de peso que você faz: data, valor e uma observação opcional, no máximo um por dia.</p>
      <h3>Água e meta de peso</h3>
      <p>
        Os registros de água que você anota (quantidade, dia e horário), a meta de água de cada dia e, se você definir, a sua
        meta de peso (com o peso de início e a data em que foi definida). Servem só para o contador, o gráfico e os relatórios,
        são visíveis apenas para você (nunca para quem está na sua casa) e são apagados junto com a conta. A água dos alimentos
        e bebidas das refeições não é contada.
      </p>

      <h3>Treinos</h3>
      <p>
        Os treinos que você registrar: data, tipo, duração, intensidade e uma nota opcional. Eles servem só de contexto
        para o seu dia e para o relatório semanal, e são apagados junto com a conta. A estimativa de gasto dos treinos,
        se você ligá-la, é calculada na hora e não fica guardada.
      </p>
      <h3>Suplementos e medicações</h3>
      <p>
        Os suplementos e medicações que você registrar (nome, dose, frequência e os registros de cada dose, com data, horário e,
        nos injetáveis, o local da aplicação, se você optar por anotá-lo). Eles ficam só com você: não são enviados à IA, não
        aparecem para a casa nem em relatórios, entram em exportações só se você marcar essa opção, e são apagados junto com a
        conta. O recurso fica desligado até você ativá-lo e não está disponível para menores de 18 anos.
      </p>
      <p>
        O Bocado só guarda o que você informa: não recomenda, calcula nem ajusta doses. Esses dados podem ser considerados dados
        de saúde pela LGPD e são tratados com base no seu consentimento, dado ao ativar o registro. Se você gerar um arquivo de
        calendário com lembretes, ele é criado na hora para o seu aparelho e não fica guardado nem publicado pelo Bocado.
      </p>
      <h3>Bem-estar e uso de medicamento GLP-1</h3>
      <p>
        Se você ativar o modo de uso de medicamento GLP-1, o app guarda o que você informar sobre o seu dia: náusea, apetite,
        energia e intestino (escalas de 0 a 3), uma nota opcional de até 280 caracteres, o piso de proteína que você definir e a
        própria preferência. O Bocado só registra e organiza: não orienta sobre a medicação, a dose nem o ciclo. O recurso fica
        desligado até você ativá-lo e não está disponível para menores de 18 anos.
      </p>
      <h3>Jejum intermitente</h3>
      <p>
        Se você ativar o registro de jejum, guardamos as janelas que você iniciar ou encerrar: horário de início e de fim (em
        UTC, exibidos no fuso do seu aparelho), a meta em horas e uma nota opcional. O Bocado só registra; não indica nem
        prescreve jejum. Fica desligado até você confirmar que leu o aviso e não está disponível para menores de 18 anos.
      </p>
      <p>
        Esses dados de saúde (bem-estar, GLP-1 e jejum) são tratados com base no seu consentimento, dado ao ativar cada recurso.
        Eles ficam só com você: não aparecem para a casa nem para a administração, não são enviados à IA, não entram em
        análises de uso nem em registros técnicos (logs), entram em exportações só se você marcar essa opção e são apagados
        junto com a conta.
      </p>
      <h3>Confirmações do acervo</h3>
      <p>
        Ao tocar em &ldquo;Os valores conferem com o rótulo&rdquo; num produto do acervo, guardamos a ligação entre a sua conta e
        o produto (uma por pessoa). Ela serve só para contar quantas pessoas diferentes confirmaram e dar o selo
        &ldquo;Verificado&rdquo; (2 ou mais); a contagem é pública, mas quem confirmou não aparece para ninguém. A confirmação é
        apagada com a conta.
      </p>
      <h3>Uso da IA e denúncias</h3>
      <p>
        Contadores de uso de IA: guardamos quando e qual recurso de IA foi usado (foto, descrição, leitura de rótulo ou
        sugestão) e a quantidade de tokens da chamada, sem o conteúdo (nada de foto, texto digitado ou resposta). Isso serve
        para aplicar os limites diários e mensais e para controlar os custos do beta. Os registros mais antigos que 13 meses
        são apagados, e, ao excluir a conta, os registros ficam anônimos (sem ligação com você).
      </p>
      <p>
        Se você denunciar um produto do acervo com dados errados, guardamos a denúncia e o motivo que você escreveu.
      </p>
      <p>
        Peso, altura e hábitos alimentares podem ser considerados dados de saúde pela LGPD. Eles são tratados com base
        no seu consentimento, dado ao preenchê-los, e usados apenas para as finalidades descritas aqui.
      </p>

      <h2 id="ia">3. Fotos e descrições (IA)</h2>
      <p>
        Quando você usa a análise por foto ou por descrição, a imagem ou o texto é enviado à API da Anthropic (Claude),
        apenas para estimar os alimentos e nutrientes. O mesmo vale para a foto da tabela nutricional ao cadastrar um
        produto. As fotos não são armazenadas pelo Bocado: ficam só na memória durante a análise e são descartadas. Só
        é salvo o que você confirmar.
      </p>
      <h3>Registro por voz</h3>
      <p>
        No registro por voz, o áudio é processado pelo serviço de reconhecimento de voz do seu navegador ou sistema (por
        exemplo, Apple ou Google) e só o texto chega ao Bocado. Nenhum áudio é gravado nem enviado aos nossos servidores,
        e o texto reconhecido só aparece num campo para você revisar antes de qualquer análise.
      </p>
      <p>
        No card &ldquo;Para fechar o dia&rdquo;, enviamos à Anthropic o quanto falta para suas metas, o tipo da refeição,
        seu objetivo e os ingredientes que você digitou ou, se não digitar, os nomes de alimentos que você costuma
        registrar. Não enviamos seu nome, e-mail nem foto de perfil.
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
        As sugestões do &ldquo;Para fechar o dia&rdquo; podem ficar em cache no servidor por 30 dias, para evitar
        chamadas repetidas. A chave do cache é calculada só a partir de valores arredondados de calorias e macros, do
        tipo da refeição, do objetivo e dos ingredientes; ela não guarda nenhuma identificação de quem pediu.
      </p>
      <p>
        Para corrigir erros, os registros técnicos do servidor (logs) podem guardar a estimativa devolvida pela IA, ou
        seja, nomes de alimentos e números de nutrientes. Fotos nunca vão para esses registros.
      </p>

      <h2 id="codigo-de-barras">4. Código de barras e acervo de produtos</h2>
      <p>
        Ao ler um código de barras, o número do código é consultado no Open Food Facts (openfoodfacts.org), uma base
        aberta de produtos. Nenhum dado pessoal é enviado. Os produtos encontrados lá são copiados para o acervo do
        Bocado, e os códigos que a base não tem ficam registrados por 7 dias para não repetirmos a consulta.
      </p>
      <p>
        Se o produto não existir, você pode cadastrá-lo a partir da foto do rótulo. A foto não é guardada, só os valores
        que você revisar e confirmar. Esses produtos ficam num acervo compartilhado, visível para todos os usuários do
        Bocado, e o cadastro fica associado à sua conta enquanto ela existir. Outros usuários podem denunciar dados
        errados.
      </p>

      <h2 id="casa">5. Casa e compartilhamento</h2>
      <p>
        Você pode criar uma &ldquo;casa&rdquo; e convidar até 5 pessoas por um código ou link (válido por 7 dias).
        Quem está na casa vê <strong>apenas o seu nome, a sua foto e as receitas que você marcar como compartilhadas</strong>.
        O seu diário, as refeições, as metas, o peso, os treinos, os relatórios, as favoritas e a meta adaptativa nunca ficam
        visíveis para a casa, e o seu e-mail também não.
      </p>
      <p>
        Se você dividir uma refeição com alguém da casa, essa pessoa recebe uma oferta com o nome da refeição, a porção e os
        valores nutricionais da parte dela, e decide se adiciona ao próprio diário (ou liga a aceitação automática). Cada
        cópia é independente: editar ou apagar a sua não altera a dos outros.
      </p>
      <p>
        Ao sair da casa ou ser removido, as suas receitas voltam a ser só suas e as ofertas pendentes enviadas ou recebidas
        por você são apagadas. Se quem criou a casa sair, o membro mais antigo assume; se não restar ninguém, a casa é
        apagada. Ao excluir a conta, a mesma regra vale, as suas receitas compartilhadas são apagadas e as refeições que você
        dividiu e que já estão no diário de outras pessoas continuam lá, sem o seu nome.
      </p>

      <h2 id="finalidade">6. Para que usamos os dados</h2>
      <p>
        Exclusivamente para fazer o app funcionar: manter sua conta, calcular suas metas, mostrar seu histórico e
        estimar refeições. Não há anúncios, não vendemos seus dados e não os compartilhamos com terceiros, exceto os
        prestadores que fazem o app funcionar:
      </p>
      <ul>
        <li>Anthropic, para a análise por IA descrita acima;</li>
        <li>Google, para o login com Google;</li>
        <li>Cloudflare, para a entrega e a segurança do tráfego do app.</li>
      </ul>

      <h2 id="cookies">7. Cookies</h2>
      <p>Usamos apenas cookies essenciais, do tipo httpOnly, que não podem ser lidos por scripts da página:</p>
      <ul>
        <li>um cookie de sessão, que mantém você conectado por até 30 dias ou até você sair da conta;</li>
        <li>
          no login com Google, um cookie temporário de segurança, válido por 10 minutos, que protege o retorno do Google
          contra fraudes.
        </li>
      </ul>
      <p>Não usamos cookies de rastreamento, publicidade nem ferramentas de analytics.</p>

      <h2 id="seguranca">8. Armazenamento e segurança</h2>
      <p>
        Os dados ficam em um banco PostgreSQL em servidor próprio. Todo o acesso ao app é feito por HTTPS, as senhas são
        guardadas com hash e a sessão fica em cookie httpOnly. Nenhum sistema é totalmente imune a falhas, mas adotamos
        essas medidas para proteger suas informações.
      </p>

      <h2 id="retencao">9. Por quanto tempo guardamos</h2>
      <p>
        Seus dados ficam enquanto a conta existir e são apagados quando você a exclui.
      </p>
      <p>
        Lista de espera: o e-mail e o nome ficam guardados até o convite ser enviado e a conta ser criada, ou até você pedir a
        remoção por e-mail para <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. O registro de qual convite uma conta usou é
        apagado junto com a conta.
      </p>

      <h2 id="direitos">10. Seus direitos</h2>
      <p>
        Pela LGPD, você pode confirmar se tratamos seus dados, acessá-los, corrigi-los, levá-los para outro serviço
        (portabilidade), pedir a eliminação e revogar o consentimento. Direto no app, em Perfil:
      </p>
      <ul>
        <li>corrija seu perfil, metas, refeições e registros de peso;</li>
        <li>exporte suas refeições, peso, água e treinos em CSV, para abrir no Excel (jejum, bem-estar e suplementos só se você marcar);</li>
        <li>
          exclua sua conta em &ldquo;Excluir conta&rdquo;. Isso apaga de forma definitiva seu perfil, refeições, pesos,
          treinos, receitas, alimentos cadastrados por você, registros de bem-estar, jejum e confirmações do acervo, contadores de
          uso e denúncias. Os produtos que você cadastrou no
          acervo compartilhado continuam, sem ligação com você.
        </li>
      </ul>
      <p>
        Se preferir, escreva para <a href={`mailto:${CONTACT}`}>{CONTACT}</a> a partir do e-mail da sua conta. Respondemos
        em até 15 dias. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2 id="criancas">11. Crianças e adolescentes</h2>
      <p>
        O Bocado não é voltado a menores de 13 anos. Para quem tem de 13 a 17 anos, recomendamos o uso com supervisão de
        um responsável.
      </p>

      <h2 id="alteracoes">12. Alterações e contato</h2>
      <p>
        Esta política pode ser atualizada quando o app mudar. A data no topo indica a versão atual, e avisaremos dentro
        do app quando houver mudança relevante. Dúvidas: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
      </p>
    </LegalPage>
  );
}
