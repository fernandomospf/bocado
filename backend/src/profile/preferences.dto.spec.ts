import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { analysisCacheKey } from '../analysis/analysis.normalize';
import { PROMPT_VERSION, SUGGEST_PROMPT_VERSION, SUGGEST_SYSTEM_PROMPT, SYSTEM_PROMPT } from '../analysis/analysis.prompt';
import { PreferencesDto } from './dto/profile.dto';

const errorsOf = (plain: object) => validate(plainToInstance(PreferencesDto, plain), { whitelist: true, forbidNonWhitelisted: true });

describe('PreferencesDto.hideCalories', () => {
  it.each([true, false])('aceita booleano (%s)', async (value) => {
    expect(await errorsOf({ hideCalories: value })).toHaveLength(0);
  });

  it('é opcional e independente das outras preferências', async () => {
    expect(await errorsOf({})).toHaveLength(0);
    expect(await errorsOf({ hideWeightInReports: true })).toHaveLength(0);
    expect(await errorsOf({ hideCalories: true, hideWeightInReports: false })).toHaveLength(0);
  });

  it.each(['sim', 1, 0, null, [], {}])('rejeita valor não booleano (%j)', async (value) => {
    const errors = await errorsOf({ hideCalories: value });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejeita campo desconhecido (não dá para trocar de usuário pelo corpo)', async () => {
    expect((await errorsOf({ hideCalories: true, userId: 'outro' })).length).toBeGreaterThan(0);
  });
});

describe('prompts da IA: descrição neutra', () => {
  const RULE = 'Descreva os alimentos de forma neutra e objetiva. Não faça julgamentos sobre a refeição';

  it('análise e sugestões pedem descrição neutra, sem julgar a refeição', () => {
    for (const prompt of [SYSTEM_PROMPT, SUGGEST_SYSTEM_PROMPT]) {
      expect(prompt).toContain(RULE);
      for (const word of ['pesado', 'ruim', 'saudável', 'calórico demais']) expect(prompt).toContain(word);
    }
  });

  it('a versão subiu e invalida o cache das análises antigas', () => {
    expect(PROMPT_VERSION).toBeGreaterThanOrEqual(2);
    expect(SUGGEST_PROMPT_VERSION).toBeGreaterThanOrEqual(2);
    expect(analysisCacheKey('2 ovos', 'modelo', 1)).not.toBe(analysisCacheKey('2 ovos', 'modelo', PROMPT_VERSION));
  });
});
