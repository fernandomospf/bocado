# Dados da base de alimentos

## `taco.json`: Tabela TACO

Composição centesimal (valores por 100 g de parte comestível) extraída da
**Tabela Brasileira de Composição de Alimentos (TACO), 4ª edição revisada e ampliada**.

> NÚCLEO DE ESTUDOS E PESQUISAS EM ALIMENTAÇÃO (NEPA). *Tabela brasileira de composição de alimentos – TACO*.
> 4. ed. rev. e ampl. Campinas: NEPA-UNICAMP, 2011.

- **Fonte:** planilha oficial publicada pelo NEPA/Unicamp em
  <https://nepa.unicamp.br/publicacoes/tabela-taco-excel/> (aba "CMVCol taco3", composição centesimal).
  Arquivo baixado em 13/11/2026 (`Last-Modified: 18/11/2024`, SHA-256
  `a66b8ec528daeabc63bc2b015fc9bd8c6d76b941c2fc0ed93a4311d449302d14`). Os valores foram conferidos por
  amostragem com o PDF oficial da 4ª edição.
- **Licença:** a publicação declara: *"É permitida a reprodução total ou parcial do material, desde que seja
  citada a fonte."* A citação acima atende a essa condição; mantenha-a ao redistribuir estes dados.

### Campos

`name`, `category`, `kcal` (energia, kcal), `protein` (proteína, g), `carbs` (carboidrato, g) e `fat` (lipídeos, g),
todos por 100 g e arredondados para uma casa decimal.

### Tratamento aplicado

- `NA` (não aplicável), `Tr` (traço) e células vazias viram `0`.
- `*` significa, pela legenda oficial, *"as análises estão sendo reavaliadas"*. Num macro isolado, ele vira `0`.
  Os **4 alimentos com `*` também na energia** ficaram **de fora**, para não gravar um falso "0 kcal":
  450 Iogurte, sabor abacaxi; 457 Leite, de vaca, desnatado, UHT; 458 Leite, de vaca, integral; 591 Coco, verde, cru.
  Resultado: 593 dos 597 alimentos.
- Removidas as marcas das notas de rodapé ¹ e ² nos nomes "Cana, aguardente" e "Cerveja, pilsen".

### Como regenerar

```bash
mkdir -p /tmp/taco && cd /tmp/taco
curl -L -o taco.xlsx https://nepa.unicamp.br/publicacoes/tabela-taco-excel/
npm i --no-save xlsx@0.18.5
node <repo>/backend/prisma/data/tools/taco-convert.js taco.xlsx <repo>/backend/prisma/data/taco.json
```

## `portions.json`: medidas caseiras

Porção de referência para alguns alimentos da TACO, ligada pelo nome exato (`food`). Inclui só medidas amplamente
aceitas ou definidas pela embalagem (lata de 350 ml). Para bebidas, considera-se 1 ml ≈ 1 g, como no resto do app.
Alimentos sem medida confiável ficam sem porção, e a busca mostra os valores por 100 g.
O seed falha se algum nome daqui não existir em `taco.json`.
