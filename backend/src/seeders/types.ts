export type Seeder = {
  name: string;
  run: () => Promise<number>;
};
