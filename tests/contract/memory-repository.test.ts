import { MemoryCareRepository } from "@/db/file-repository";
import { runCareRepositoryContractSuite } from "./care-repository.contract";

runCareRepositoryContractSuite("MemoryCareRepository", () => new MemoryCareRepository());
