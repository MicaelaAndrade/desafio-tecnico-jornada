import { ehFimDeSemana, formatarDiaComSemana, formatarMinutos, formatarSaldo } from './format';

describe('utilitários de formatação', () => {
  describe('formatarMinutos', () => {
    it('formata duração em horas e minutos', () => {
      expect(formatarMinutos(480)).toBe('8h 00m');
      expect(formatarMinutos(90)).toBe('1h 30m');
      expect(formatarMinutos(5)).toBe('0h 05m');
    });

    it('preserva o sinal de durações negativas', () => {
      expect(formatarMinutos(-90)).toBe('-1h 30m');
    });
  });

  describe('formatarSaldo', () => {
    it('marca crédito com sinal explícito', () => {
      expect(formatarSaldo(45)).toBe('+0h 45m');
    });

    it('marca débito com sinal negativo', () => {
      expect(formatarSaldo(-45)).toBe('-0h 45m');
    });

    it('não põe sinal em saldo zerado', () => {
      expect(formatarSaldo(0)).toBe('0h 00m');
    });
  });

  describe('formatarDiaComSemana', () => {
    // A data é montada em UTC de propósito: se fosse construída no fuso do
    // navegador, o rótulo mudaria de dia para quem está a oeste de Greenwich.
    it('resolve o dia da semana sem depender do fuso do navegador', () => {
      expect(formatarDiaComSemana('2026-09-14')).toBe('seg, 14/09');
      expect(formatarDiaComSemana('2026-09-12')).toBe('sáb, 12/09');
    });

    it('preserva zeros à esquerda', () => {
      expect(formatarDiaComSemana('2026-01-05')).toBe('seg, 05/01');
    });
  });

  describe('ehFimDeSemana', () => {
    it('identifica sábado e domingo', () => {
      expect(ehFimDeSemana('2026-09-12')).toBe(true);
      expect(ehFimDeSemana('2026-09-13')).toBe(true);
    });

    it('não marca dia útil', () => {
      expect(ehFimDeSemana('2026-09-14')).toBe(false);
    });
  });
});
