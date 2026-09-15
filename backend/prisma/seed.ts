/**
 * Carga de demonstração no banco.
 *
 * O cenário em si vive em `seed-data.ts`, compartilhado com o modo demonstração,
 * para que as duas formas de subir a aplicação mostrem exatamente os mesmos dados.
 */
import { PrismaClient } from '@prisma/client';
import { ClienteDeCarga, SENHA_PADRAO, popularCenario } from './seed-data';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // A carga roda a cada `docker compose up`. Sem esta guarda, reiniciar o ambiente
  // apagaria os dados criados durante a avaliação. Use `--force` para recriar.
  const jaPopulado = await prisma.user.count();
  if (jaPopulado > 0 && !process.argv.includes('--force')) {
    console.log(
      'Base já populada — seed ignorado. Use "npm run prisma:seed -- --force" para recriar.',
    );
    return;
  }

  console.log('Limpando dados anteriores...');
  await prisma.timeEntry.deleteMany();
  await prisma.correctionRequest.deleteMany();
  await prisma.monthlyClosing.deleteMany();
  await prisma.user.deleteMany();

  console.log('Criando cenário de demonstração...');
  const { usuarios } = await popularCenario(prisma as unknown as ClienteDeCarga);

  console.log('\nUsuários criados (senha: %s):', SENHA_PADRAO);
  console.table(usuarios);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
