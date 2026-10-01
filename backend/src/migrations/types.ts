export type Migration = {
  name: string;
  run: () => Promise<number>;
};
