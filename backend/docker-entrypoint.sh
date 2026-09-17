#!/bin/sh
#
# Inicialização da API no contêiner.
#
# Existe por causa de duas armadilhas que só aparecem em `docker compose up` com
# volume vazio — isto é, exatamente na primeira execução de quem for avaliar o
# projeto, e por isso a pior hora para falhar.
set -e

TENTATIVAS=90
INTERVALO=4

# 1. Espera o banco aceitar conexões de verdade.
#
# `depends_on: condition: service_healthy` não basta. Na primeira subida, a
# imagem do Postgres inicia o servidor, roda o `initdb` e então o REINICIA. O
# `pg_isready` do healthcheck passa na janela anterior ao reinício, o compose
# libera este contêiner, e a conexão seguinte é recusada com P1001.
#
# Quem espera é o próprio `migrate deploy`, não um `pg_isready` à parte: assim a
# condição de parada é "a migration passou", que é o que de fato precisamos, e
# não uma aproximação dela.
#
# 90 tentativas × 4s = 6 minutos de orçamento. Parece muito para um ciclo que,
# numa máquina folgada, termina em 1-2 segundos — mas numa Codespace
# compartilhada e sob carga, o reinício do Postgres depois do `initdb` já foi
# observado levando bem mais que os 60-90s que este script dava antes. O custo
# de esperar demais é zero (o loop sai assim que `migrate deploy` funciona); o
# custo de esperar de menos é a pessoa avaliando o desafio ver a API cair antes
# de o banco terminar de subir, o que parece bug de conexão e não é.
echo "Aplicando migrations..."

tentativa=1
while [ "$tentativa" -le "$TENTATIVAS" ]; do
  if npx prisma migrate deploy; then
    break
  fi

  if [ "$tentativa" -eq "$TENTATIVAS" ]; then
    echo "Banco não respondeu após $TENTATIVAS tentativas. Encerrando." >&2
    echo "Verifique o serviço 'db' com: docker compose logs db" >&2
    exit 1
  fi

  echo "Banco ainda não respondeu (tentativa $tentativa de $TENTATIVAS). Nova tentativa em ${INTERVALO}s..."
  tentativa=$((tentativa + 1))
  sleep "$INTERVALO"
done

# 2. O seed não derruba a API.
#
# Antes, os três comandos eram encadeados com `&&`: um seed que falhasse
# impedia o `node dist/main` de rodar, e o sintoma era um 502 do nginx — que não
# diz nada sobre a causa. Dado de demonstração é conveniência; a aplicação
# subir é requisito. O aviso fica no log, alto, e quem precisar reexecuta com
# `docker compose exec api npx prisma db seed`.
echo "Populando cenário de demonstração..."

if ! npx prisma db seed; then
  echo "AVISO: o seed falhou. A API sobe assim mesmo, mas sem os usuários de" >&2
  echo "demonstração não será possível entrar. Reexecute com:" >&2
  echo "  docker compose exec api npx prisma db seed" >&2
fi

exec node dist/main
