import 'reflect-metadata';
import { bootstrap } from './app.js';
import { container } from './ioc.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main() {
  const app = await bootstrap(container);

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
