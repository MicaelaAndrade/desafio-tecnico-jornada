# ADR-0007 — Coerência entre país declarado e fuso detectado

**Status:** Aceito
**Data:** 2026-09-16

## Contexto

Cada marcação carrega duas informações de localidade, obtidas de formas diferentes
(ver [ADR-0004](./0004-estrategia-de-fuso-horario.md)):

- **`timezone`** — lido do dispositivo, não digitável. É o que calcula: posiciona a marcação
  no dia de trabalho correto e define o horário local exibido.
- **`countryCode`** — digitado pelo colaborador. Não participa de cálculo nenhum; é registro
  de auditoria sobre a jurisdição em que o dia aconteceu.

Nada impedia que os dois se contradissessem. Alguém com o relógio em `America/Sao_Paulo`
podia declarar `DE`, e a marcação era aceita sem comentário. A divergência ficava gravada,
imutável, e só apareceria no fechamento — quando corrigi-la já exige solicitação de correção
e homologação.

A pergunta que isso levanta é se o sistema deve arbitrar geografia.

## Decisão

**Avisar, nunca bloquear.**

Quando o fuso detectado é um dos fusos conhecidos da operação e o país declarado (completo,
duas letras) discorda dele, a tela de ponto exibe um aviso informativo antes do registro:

> Seu dispositivo indica **BR** (America/Sao_Paulo), mas você declarou **DE**. A marcação será
> registrada assim mesmo — confira se o país está certo.

O botão de registro permanece habilitado. Nenhuma validação é adicionada no servidor.

A verificação vive em `frontend/src/app/core/utils/localidade.ts`, sobre um mapa explícito de
fuso → país que cobre apenas os países da operação descrita. Três regras a delimitam:

1. **Fuso fora do mapa não gera aviso.** `Asia/Tokyo` com país `BR` passa em silêncio.
2. **País incompleto não é divergência.** Enquanto a pessoa digita o "D" de "DE", nada aparece.
3. **A checagem só olha de fuso para país, nunca ao contrário.** Um fuso pode servir a mais de
   um país — `Europe/Zurich` também atende Liechtenstein — então "país X aceita fuso Y" não é
   uma pergunta que este mapa saiba responder.

## Justificativa

- **Impedir o registro de uma jornada que aconteceu é o pior desfecho possível.** A pessoa
  trabalhou; o sistema tem que aceitar. Um controle de ponto que recusa marcações empurra o
  registro de volta para a planilha, que é exatamente o problema que a plataforma existe para
  resolver.
- **Fuso e país não têm relação de um para um, e discordar pode ser legítimo.** VPN corporativa,
  relógio do sistema mal configurado, conexão em aeroporto de terceiro país, máquina emprestada.
  Tratar qualquer uma dessas situações como erro seria assumir uma precisão que o dado não tem.
- **O momento certo de perguntar é antes de gravar.** A marcação é imutável
  ([ADR-0003](./0003-imutabilidade-e-correcoes.md)): depois de registrada, ajustar o país custa
  uma solicitação de correção e a homologação de um gestor. Um aviso na hora custa um segundo.
- **O aviso é âmbar, não vermelho.** Não é erro, é pergunta. A cor de erro está reservada para
  pendência de verdade, como jornada aberta sem saída.

## Consequências

- O mapa de fusos precisa de manutenção quando a operação abrir em um país novo. É trabalho
  conhecido e trivial, e a degradação enquanto isso é o silêncio — nunca um falso alarme.
- A divergência continua sendo gravável. Se o colaborador confirmar, a marcação é registrada
  com `timezone` e `countryCode` contraditórios, e a trilha de auditoria preserva ambos. Isso é
  intencional: o registro reflete o que foi declarado, não o que o sistema achou melhor.
- O servidor não valida a combinação. Uma integração que use a API diretamente não recebe o
  aviso. Aceitável no MVP porque a regra é de experiência de uso, não de integridade; se um dia
  virar regra de negócio, o lugar dela é no domínio, não no controller.

## Alternativas consideradas

- **Bloquear o registro em caso de divergência.** Descartada pelos motivos acima. Transforma um
  palpite de geografia em impedimento para exercer um direito trabalhista.
- **Corrigir o país automaticamente a partir do fuso.** Descartada: apagaria a declaração da
  pessoa, que é justamente o dado que o campo existe para capturar. Um sistema que sobrescreve
  silenciosamente o que o usuário informou perde a rastreabilidade que o torna auditável.
- **Derivar o país do IP em vez de perguntar.** Mais preciso na média, mas introduz dependência
  de serviço externo de geolocalização, trata endereço IP como dado pessoal adicional sob o
  GDPR e falha exatamente no caso que importa — VPN. Não compensa.
- **Não fazer nada e documentar o porquê.** Defensável: o país não entra no cálculo e a
  divergência é visível na auditoria. Descartada porque não ajuda quem errou sem perceber, que
  é o caso comum, e o custo de ajudar é baixo.
