import type { Seeder } from './types';
import { technologiesSeeder } from './technologiesSeeder';

const seeders: Seeder[] = [technologiesSeeder];

export const runSeeders = async (): Promise<number> => {
  let totalInserted = 0;

  for (const seeder of seeders) {
    const inserted = await seeder.run();
    if (inserted > 0) {
      console.log(`[seed] ${seeder.name}: +${inserted}`);
    }
    totalInserted += inserted;
  }

  return totalInserted;
};
