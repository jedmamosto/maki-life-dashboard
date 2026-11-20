import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";
import { FileCareRepository } from "@/db/file-repository";
import { runCareRepositoryContractSuite } from "./care-repository.contract";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

runCareRepositoryContractSuite("FileCareRepository", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "maki-care-repo-"));
  tempDirs.push(dir);
  return new FileCareRepository(path.join(dir, "care.json"));
});
