import type { CareRepository } from "@/lib/types";
import { FileCareRepository, MemoryCareRepository } from "./file-repository";
import { PostgresCareRepository } from "./postgres-repository";

declare global {
  var __makiDefaultRepo: CareRepository | undefined;
}

let testRepositoryOverride: CareRepository | null = null;

export function setCareRepositoryForTests(repo: CareRepository | null): void {
  testRepositoryOverride = repo;
}

export function getCareRepository(): CareRepository {
  if (testRepositoryOverride) {
    return testRepositoryOverride;
  }
  if (globalThis.__makiDefaultRepo) {
    return globalThis.__makiDefaultRepo;
  }

  const driver = process.env.CARE_REPO_DRIVER;
  let repo: CareRepository;
  if (driver === "memory") {
    repo = new MemoryCareRepository();
  } else if (driver === "file" || !process.env.DATABASE_URL) {
    repo = new FileCareRepository(
      process.env.CARE_DATA_FILE ?? ".data/maki-care.json",
    );
  } else {
    repo = new PostgresCareRepository();
  }
  globalThis.__makiDefaultRepo = repo;
  return repo;
}
