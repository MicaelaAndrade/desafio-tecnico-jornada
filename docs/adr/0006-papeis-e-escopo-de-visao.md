# ADR-0006 — Papéis e escopo de visão

**Status:** Aceito
**Data:** 2026-09-14

## Contexto

O enunciado cita três atores no processo atual — "colaboradores, gestores e RH" — mas não
detalha o que cada um pode fazer. Jornada de trabalho é dado pessoal de natureza sensível
do ponto de vista trabalhista, e a operação abrange a União Europeia, onde o GDPR se
aplica. Visibilidade irrestrita não é uma opção aceitável.

## Decisão

Três papéis, com escopo de visão crescente:

| Papel | Escopo de leitura | Pode registrar | Pode aprovar correção | Pode fechar competência |
|---|---|---|---|---|
| `EMPLOYEE` | apenas a própria jornada | própria, em tempo real | não | não |
| `MANAGER` | própria + subordinados diretos (`managerId`) | própria; de subordinado, como lançamento manual justificado | dos subordinados | não |
| `HR` | todos os colaboradores | de qualquer colaborador, como lançamento manual justificado | de qualquer colaborador | sim, e reabrir |

Regras transversais:

- **Todo lançamento em nome de terceiro** é gravado com `source = MANUAL`,
  `registeredById` = quem lançou, e exige justificativa. O sistema nunca perde a distinção
  entre "o colaborador marcou" e "alguém marcou por ele".
- **Ninguém aprova a própria correção.** Uma correção solicitada por um gestor sobre a
  própria jornada é encaminhada ao RH.
- O escopo é aplicado no **serviço**, não apenas na rota. Um `MANAGER` que consulte
  diretamente o id de um colaborador fora do seu time recebe `403`, independentemente do
  endpoint utilizado.

## Justificativa

- **Minimização de acesso (GDPR, art. 5º).** Gestor vê o necessário para gerir seu time,
  não a empresa inteira. Com operação na Europa, esse é um requisito legal, não uma
  preferência de produto.
- **Separação entre registrar e homologar.** Quem marca o ponto não é quem aprova o
  ajuste — é o que dá validade ao controle.
- **A trilha de autoria é o que diferencia esta plataforma da planilha atual.** Sem
  `registeredById`, "quem colocou esse horário aqui?" volta a ser uma pergunta sem resposta.

## Consequências

- O escopo do gestor depende de `User.managerId` estar corretamente preenchido; o seed
  cobre esse cenário e o README documenta a dependência.
- A hierarquia é de um nível (subordinado direto). Gestor de gestor não enxerga a equipe
  estendida por padrão — decisão conservadora, consistente com minimização de acesso.
  Hierarquia recursiva fica registrada como evolução possível.
- Não há papel de administrador técnico distinto de `HR`. Para o escopo do MVP, o RH
  acumula a gestão de usuários; numa evolução, separar `ADMIN` de `HR` seria adequado.

## Alternativas consideradas

- **RBAC apenas na camada de rota** (guard por endpoint) — insuficiente: qualquer endpoint
  que aceite `userId` como parâmetro vazaria dados de fora do escopo. Por isso a
  verificação vive no serviço.
- **ABAC / permissões granulares por recurso** — mais flexível, porém desproporcional ao
  domínio, que tem três papéis estáveis e bem delimitados.
- **Visibilidade total para gestores** — simplificaria o código e é o que a planilha
  compartilhada faz hoje; descartada por conflito direto com o GDPR.
