# Tom do Bocado: sem culpa

Estes princípios valem para texto, cor e IA. A meta é uma referência para orientar, não uma prova a ser passada.

## Princípios

1. **Passar da meta é um dado, não uma falha.** Nada de "estourou", "excedeu", "passou do limite", "dia perdido",
   "cheat", "compensar", "merecer", "pecado", "queimou".
2. **Cor.** Exceder a meta usa a MESMA cor do restante (texto normal) ou um destaque suave do azul do app.
   Nunca vermelho, nem laranja de alerta.
   - Barras do histórico acima da meta: só um tom mais escuro do mesmo azul (`.bar-fill.over`).
   - Anéis: a "segunda volta" já é neutra.
   - `--danger` e vermelho valem apenas para ERROS técnicos (rede, validação) e ações destrutivas (excluir, sair).
   - `--ring-kcal` é a cor de identidade do anel de Energia, não um sinal de "passou da meta".
3. **Verbos neutros e informativos.**
   - "Acima da meta" → "Além da meta" (mesma cor) · "Ainda cabem 809 kcal" → "Restam 809 kcal".
   - "Faltam 48 g de proteína" continua: é informação útil.
4. **Sem comemorar nem punir.** Nada de "parabéns" por déficit nem "cuidado" por superávit.
5. **Dias sem registro: nenhuma cobrança.** Estado vazio: "Nada registrado neste dia". Nunca "você não registrou" ou
   "você deveria".
6. **Sugestões de refeição** são "sugestão", nunca "dieta". Nunca incentivar comer mais por ter treinado.
7. **IA.** Os prompts pedem descrição neutra e objetiva dos alimentos, sem julgar a refeição ("pesado", "ruim",
   "saudável", "calórico demais"). Mudou o prompt? Suba `PROMPT_VERSION` / `SUGGEST_PROMPT_VERSION`.

## Modo "Esconder calorias"

Para quem prefere acompanhar proteína e constância sem números de calorias. É só interface: o backend guarda e devolve tudo.
Use `useDisplayPrefs()`, `<Kcal />` e `fmtKcal()` (`lib/display-prefs.ts`, `lib/kcal.ts`) em vez de condicionais soltas, e a classe
`.kcal-only` para elementos que só existem para mostrar kcal. Campos de ENTRADA de kcal (editores) ficam em "Mais detalhes".
