// Configuração separada de propósito (ver README, "Limitações conhecidas" →
// "Testes contra o banco real"): estes testes sobem um PostgreSQL efêmero via
// Testcontainers, então precisam de Docker disponível e de um timeout bem
// maior do que o resto da suíte. Ficam fora do `npm test` padrão — que
// continua rápido e sem dependência de infraestrutura — e rodam só com
// `npm run test:db`.
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/db/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
  testTimeout: 60000,
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
};
