import { getDataProvider } from "./prisma-repository";

export function getRepositories() {
  return getDataProvider();
}

export * from "./types";
