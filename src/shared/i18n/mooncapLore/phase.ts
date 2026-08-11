// Shared key-shape builder for the Mooncap phase dossier.
//
// Extracted 2026-08-04 when the lore was split per language (audit F8): the
// four language modules differ only in their copy, so the key layout lives
// here once rather than being duplicated into each of them.
import type { Catalog } from '../core';

export function phase(
  stage: number,
  name: string,
  age: string,
  condition: string,
  observation: string,
): Catalog {
  return {
    [`mooncap.phase.${stage}.name`]: name,
    [`mooncap.phase.${stage}.age`]: age,
    [`mooncap.phase.${stage}.condition`]: condition,
    [`mooncap.phase.${stage}.observation`]: observation,
  };
}
