# ADR-0003 — Imutabilidade dos registros e fluxo de correção

**Status:** Aceito
**Data:** 2026-09-14

## Contexto

O enunciado descreve como dor atual "divergências de horário" e "inconsistências nos
fechamentos mensais" num processo conduzido por planilhas compartilhadas. O problema de
fundo de uma planilha compartilhada não é a ausência de campos — é a ausência de
rastreabilidade: qualquer pessoa altera qualquer célula, e não sobra registro de quem
mudou o quê, quando e por quê.

Uma plataforma que apenas substitua a planilha por um formulário com `UPDATE` reproduz
exatamente o mesmo problema num banco de dados.

## Decisão

Registros de jornada são **imutáveis**. Não há endpoint de `PUT`/`PATCH` nem de `DELETE`
sobre `TimeEntry`.

Ajustes acontecem por meio de `CorrectionRequest`, que:

- exige **justificativa obrigatória** (`reason`);
- registra **quem solicitou** e, na revisão, **quem aprovou/rejeitou e quando**;
- passa por aprovação do gestor do colaborador ou do RH;
- quando aprovada, produz efeito **sem apagar nada**:
  - `ADD` → cria um novo `TimeEntry` com `source = CORRECTION`, vinculado pela
    `originCorrectionId`;
  - `REMOVE` → preenche `revokedAt` e `revokedByCorrectionId` no registro original, que
    passa a ser ignorado no cálculo mas permanece na base;
  - `MODIFY` → combina os dois: revoga o original e cria o substituto, ambos apontando
    para a mesma correção.

O cálculo da jornada considera apenas registros com `revokedAt = null`.

## Justificativa

- **Resolve a dor descrita no enunciado**, e não apenas o sintoma. A divergência de
  horário deixa de ser uma discussão sem evidência e passa a ter trilha documental.
- **Conformidade com a Portaria MTP 671/2021**, que veda alteração dos dados registrados
  e exige que ajustes sejam identificáveis.
- **Separa o fato da interpretação.** O que foi marcado e o que foi homologado são
  informações distintas, e ambas sobrevivem.
- **Permite reconstruir o estado da folha em qualquer ponto do tempo**, o que é o que
  torna um fechamento defensável numa auditoria ou num litígio trabalhista.

## Consequências

- Toda leitura de jornada precisa filtrar `revokedAt IS NULL`. Isso está encapsulado no
  repositório de `TimeEntry` para que nenhuma consulta de domínio precise lembrar disso.
- A base cresce monotonicamente. Aceitável: o volume de marcações de ponto é pequeno
  (ordem de 4 a 8 linhas por colaborador por dia útil), e o dado tem valor probatório que
  justifica a retenção.
- O fluxo tem um passo a mais para o usuário — corrigir exige justificar e aguardar
  aprovação. É o comportamento correto para o domínio: a facilidade de alterar o próprio
  ponto sem rastro é justamente o defeito do processo atual.

## Alternativas consideradas

- **`UPDATE` direto com tabela de auditoria paralela** (trigger ou `audit_log`) — atende
  a rastreabilidade, mas mantém duas fontes de verdade e torna a reconstrução histórica
  dependente da íntegra da tabela de auditoria. Descartada: se o dado principal é mutável,
  a garantia depende de um mecanismo externo a ele.
- **Soft delete simples, sem fluxo de aprovação** — mais barato, porém deixa o colaborador
  revogar a própria marcação sem supervisão, o que não elimina a divergência, apenas a
  torna silenciosa.
