import { paisSugerido } from './format';
import { divergeDoFuso, nomeDoPais, paisDoFuso } from './localidade';

describe('localidade', () => {
  describe('paisDoFuso', () => {
    it('reconhece os fusos da operação', () => {
      expect(paisDoFuso('America/Sao_Paulo')).toBe('BR');
      expect(paisDoFuso('America/Manaus')).toBe('BR');
      expect(paisDoFuso('Europe/Lisbon')).toBe('PT');
      expect(paisDoFuso('Atlantic/Azores')).toBe('PT');
      expect(paisDoFuso('Europe/Berlin')).toBe('DE');
    });

    it('não opina sobre fuso desconhecido', () => {
      expect(paisDoFuso('Asia/Tokyo')).toBeNull();
      expect(paisDoFuso('Pacific/Auckland')).toBeNull();
      expect(paisDoFuso('')).toBeNull();
    });
  });

  describe('divergeDoFuso', () => {
    it('acusa país que contradiz o fuso', () => {
      expect(divergeDoFuso('America/Sao_Paulo', 'DE')).toBe(true);
      expect(divergeDoFuso('Europe/Berlin', 'BR')).toBe(true);
    });

    it('aceita país coerente com o fuso', () => {
      expect(divergeDoFuso('America/Sao_Paulo', 'BR')).toBe(false);
      expect(divergeDoFuso('Europe/Lisbon', 'PT')).toBe(false);
    });

    // Caso contrário o aviso piscaria na tela enquanto a pessoa digita "D" de "DE".
    it('ignora país incompleto', () => {
      expect(divergeDoFuso('America/Sao_Paulo', '')).toBe(false);
      expect(divergeDoFuso('America/Sao_Paulo', 'D')).toBe(false);
    });

    it('não reclama do que não conhece', () => {
      expect(divergeDoFuso('Asia/Tokyo', 'BR')).toBe(false);
    });

    it('compara sem depender de caixa ou espaço', () => {
      expect(divergeDoFuso('America/Sao_Paulo', ' br ')).toBe(false);
      expect(divergeDoFuso('America/Sao_Paulo', ' de ')).toBe(true);
    });
  });

  describe('nomeDoPais', () => {
    it('traduz a sigla para o nome por extenso', () => {
      expect(nomeDoPais('DE')).toBe('Alemanha');
      expect(nomeDoPais('BR')).toBe('Brasil');
      expect(nomeDoPais('PT')).toBe('Portugal');
    });

    it('aceita a sigla como o campo a entrega, sem caixa nem espaço', () => {
      expect(nomeDoPais(' de ')).toBe('Alemanha');
    });

    // Sigla desconhecida não impede o registro: a tela mostra a própria sigla.
    it('devolve nulo para sigla fora da lista', () => {
      expect(nomeDoPais('XX')).toBeNull();
      expect(nomeDoPais('')).toBeNull();
    });

    it('nomeia todo país que algum fuso do mapa aponta', () => {
      for (const fuso of ['America/Sao_Paulo', 'Europe/Lisbon', 'Europe/Berlin', 'Europe/Oslo']) {
        expect(nomeDoPais(paisDoFuso(fuso)!)).not.toBeNull();
      }
    });
  });

  describe('paisSugerido', () => {
    // Regressão: a sugestão vinha do idioma do navegador. Um brasileiro com o
    // sistema em inglês recebia "US" e via o aviso de divergência em toda
    // marcação — e um aviso que sempre aparece deixa de ser lido.
    it('prefere o fuso ao idioma do navegador', () => {
      expect(paisSugerido('America/Sao_Paulo')).toBe('BR');
      expect(paisSugerido('Europe/Lisbon')).toBe('PT');
    });

    it('recai no idioma quando o fuso é desconhecido', () => {
      const regiao = (navigator.language ?? 'pt-BR').split('-')[1] ?? 'BR';
      expect(paisSugerido('Asia/Tokyo')).toBe(regiao.toUpperCase().slice(0, 2));
    });

    it('a sugestão nunca diverge do próprio fuso que a originou', () => {
      for (const fuso of ['America/Sao_Paulo', 'Europe/Lisbon', 'Europe/Berlin']) {
        expect(divergeDoFuso(fuso, paisSugerido(fuso))).toBe(false);
      }
    });
  });
});
