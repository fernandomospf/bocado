import type Anthropic from '@anthropic-ai/sdk';

export const ANALYSIS_TOOL_NAME = 'registrar_estimativa';

export const SYSTEM_PROMPT = `Você é um nutricionista que estima calorias e macronutrientes de refeições para um app brasileiro de contagem de calorias.

Como estimar:
- Identifique cada alimento separadamente, mesmo que só apareça em parte. Quando não tiver certeza, dê sua melhor estimativa e marque confiança "low"; nunca deixe de estimar algo que provavelmente está no prato.
- Estime a porção em gramas pelo tamanho visual (prato raso ~26 cm, colher de sopa, copo de 200 ml etc.) e pelos padrões de porção no Brasil.
- Use como referência a Tabela TACO/TBCA para alimentos brasileiros e a USDA para os demais.
- Considere preparo: óleo, manteiga, molhos e frituras visíveis somam calorias. Se o preparo for incerto, assuma o mais comum no Brasil.
- Os valores de cada item são para a porção estimada (não por 100 g). Mantenha coerência: kcal ≈ 4×proteína + 4×carboidratos + 9×gordura.
- Nomes curtos em português do Brasil, como o usuário escreveria ("Arroz branco", "Feijão carioca", "Peito de frango grelhado").
- Se o usuário der uma dica, ela tem prioridade sobre o que você supõe da imagem.
- Se não houver comida ou bebida, retorne isFood=false e items vazio.
- O campo items é um ARRAY JSON de objetos, nunca uma string. Todos os textos entre aspas duplas, inclusive confidence. Números sem unidade e sem texto. Use exatamente os nomes de campo do schema.

Responda SEMPRE e SOMENTE chamando a ferramenta ${ANALYSIS_TOOL_NAME}, sem texto antes ou depois.
Se por algum motivo não puder usar a ferramenta, responda apenas com o mesmo objeto em JSON puro.`;

export const ANALYSIS_TOOL: Anthropic.Tool = {
  name: ANALYSIS_TOOL_NAME,
  description: 'Registra a estimativa nutricional de cada alimento identificado na refeição.',
  input_schema: {
    type: 'object',
    properties: {
      isFood: {
        type: 'boolean',
        description: 'false se a imagem/descrição não contém comida ou bebida.',
      },
      title: {
        type: 'string',
        description: 'Nome curto da refeição, ex.: "Prato feito com frango".',
      },
      items: {
        type: 'array',
        minItems: 1,
        description: 'Array JSON de objetos, um por alimento (nunca uma string).',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nome curto do alimento em português.' },
            grams: {
              type: 'number',
              description: 'Porção estimada em gramas (ou ml para bebidas): número puro, ex.: 12.5 (sem unidade).',
            },
            kcal: { type: 'number', description: 'Calorias da porção: número puro, ex.: 12.5 (sem unidade).' },
            protein: { type: 'number', description: 'Gramas de proteína na porção: número puro, ex.: 12.5 (sem unidade).' },
            carbs: { type: 'number', description: 'Gramas de carboidratos na porção: número puro, ex.: 12.5 (sem unidade).' },
            fat: { type: 'number', description: 'Gramas de gordura na porção: número puro, ex.: 12.5 (sem unidade).' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          },
          required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat', 'confidence'],
        },
      },
      notes: {
        type: 'string',
        description: 'Uma frase curta com as principais suposições feitas (ex.: "Considerei 1 colher de óleo no preparo").',
      },
    },
    required: ['isFood', 'title', 'items'],
  },
};

// ---------------------------------------------------------------------------
// "Para fechar o dia": sugestão de refeição quando a base local não resolve
// ---------------------------------------------------------------------------

/** Mudou o prompt ou a ferramenta? Suba a versão: ela entra na chave do cache e invalida as respostas antigas. */
export const SUGGEST_PROMPT_VERSION = 1;

export const SUGGEST_TOOL_NAME = 'sugerir_refeicao';

export const SUGGEST_SYSTEM_PROMPT = `Você ajuda usuários de um app brasileiro de contagem de calorias a montar uma refeição simples para o fim do dia, com o que falta para chegar às metas.

Como sugerir:
- Crie 2 sugestões de refeição caseira brasileira simples, com ingredientes comuns de supermercado.
- A soma das calorias deve ficar perto do que falta, sem passar mais de 10%. Priorize atingir a proteína que falta.
- Quando fizer sentido, use como base os alimentos que a pessoa já costuma comer (lista abaixo).
- Gramas de cada ingrediente como servido (arroz e feijão cozidos, carne pronta). Macros de cada ingrediente na quantidade indicada, com coerência: kcal ≈ 4×proteína + 4×carboidratos + 9×gordura.
- Modo de preparo em até 3 passos curtos e tempo estimado em minutos.
- Isto é uma sugestão, nunca uma dieta ou prescrição. Não faça recomendações médicas.

Responda SEMPRE e SOMENTE chamando a ferramenta ${SUGGEST_TOOL_NAME}, sem texto antes ou depois.
Se por algum motivo não puder usar a ferramenta, responda apenas com o mesmo objeto em JSON puro.`;

export const SUGGEST_TOOL: Anthropic.Tool = {
  name: SUGGEST_TOOL_NAME,
  description: 'Registra 2 sugestões de refeição caseira para completar as metas do dia.',
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        description: 'Array JSON com 2 sugestões (nunca uma string).',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Nome curto da refeição, ex.: "Omelete com legumes e arroz".' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Ingrediente em português, ex.: "Peito de frango grelhado".' },
                  grams: { type: 'number', description: 'Gramas como servido: número puro, ex.: 120.' },
                  kcal: { type: 'number', description: 'Calorias nessa quantidade: número puro.' },
                  protein: { type: 'number', description: 'Gramas de proteína nessa quantidade: número puro.' },
                  carbs: { type: 'number', description: 'Gramas de carboidratos nessa quantidade: número puro.' },
                  fat: { type: 'number', description: 'Gramas de gordura nessa quantidade: número puro.' },
                },
                required: ['name', 'grams', 'kcal', 'protein', 'carbs', 'fat'],
              },
            },
            steps: {
              type: 'array',
              items: { type: 'string' },
              description: 'Modo de preparo: até 3 passos curtos.',
            },
            minutes: { type: 'number', description: 'Tempo estimado de preparo em minutos: número puro.' },
          },
          required: ['title', 'items', 'steps', 'minutes'],
        },
      },
    },
    required: ['suggestions'],
  },
};
