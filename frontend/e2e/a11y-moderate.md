# Violações "moderate" e "minor" do axe

Última auditoria completa (`e2e/a11y.e2e.mjs`: 40 estados, claro e escuro, 390x844 e 1280x800, tags wcag2a, wcag2aa,
wcag21a, wcag21aa e wcag22aa): **nenhuma violação serious, critical, moderate ou minor** no conjunto acima.

O teste grava as moderate/minor que surgirem em `A11Y_REPORT=arquivo.json`; se alguma aparecer no futuro, justifique-a aqui.
Regras de "boas práticas" do axe (fora das tags WCAG) não fazem parte do teste.

Contraste dos tokens: `src/lib/contrast.test.mjs` (4,5:1 em texto, 3:1 em ícones; AAA no alto contraste).
Texto ampliado: `e2e/zoom.e2e.mjs` (200%, também em alto contraste).
