import {
  InvalidTimezoneError,
  assertValidTimezone,
  isValidTimezone,
  localTimeFromFrozenOffset,
  offsetMinutesAt,
} from './timezone';

describe('timezone', () => {
  describe('validação', () => {
    it.each(['America/Sao_Paulo', 'Europe/Lisbon', 'Europe/Berlin'])('aceita %s', (tz) => {
      expect(isValidTimezone(tz)).toBe(true);
    });

    it.each(['BRT', 'CET', 'UTC-3', '', 'Marte/Olympus'])('recusa %p', (tz) => {
      expect(() => assertValidTimezone(tz)).toThrow(InvalidTimezoneError);
    });
  });

  describe('offsetMinutesAt', () => {
    it('devolve offset constante para o Brasil (sem horário de verão desde 2019)', () => {
      expect(offsetMinutesAt(new Date('2026-01-15T12:00:00Z'), 'America/Sao_Paulo')).toBe(-180);
      expect(offsetMinutesAt(new Date('2026-07-15T12:00:00Z'), 'America/Sao_Paulo')).toBe(-180);
    });

    it('varia conforme o horário de verão europeu', () => {
      const inverno = offsetMinutesAt(new Date('2026-01-15T12:00:00Z'), 'Europe/Lisbon');
      const verao = offsetMinutesAt(new Date('2026-07-15T12:00:00Z'), 'Europe/Lisbon');

      expect(inverno).toBe(0);
      expect(verao).toBe(60);
    });
  });

  describe('localTimeFromFrozenOffset', () => {
    // O horário local histórico é reconstruído a partir do offset gravado no
    // registro, e não da tz database atual (ADR-0004, item 4).
    it('reconstrói o horário local a partir do offset congelado', () => {
      const instant = new Date('2026-07-15T08:00:00Z');

      expect(localTimeFromFrozenOffset(instant, -180)).toBe('05:00'); // São Paulo
      expect(localTimeFromFrozenOffset(instant, 60)).toBe('09:00'); // Lisboa no verão
    });

    it('não depende do fuso do processo nem da tz database', () => {
      const instant = new Date('2026-07-15T08:00:00Z');
      // Mesmo que a regra de DST de Lisboa mudasse, o registro antigo continua
      // exibindo o horário que foi efetivamente marcado.
      expect(localTimeFromFrozenOffset(instant, 60)).toBe('09:00');
    });
  });
});
