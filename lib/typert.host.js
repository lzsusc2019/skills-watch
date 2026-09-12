// Host Typert manifest — the package's `exports["./typert"]` artifact.
//
// Hand-written to the exact shape produced by @deepseek-ai/dsh-typert-generator
// (compare @deepseek-ai/dsh-host-plugin-inventory/lib/typert.host.js), so no
// code-generation step is required. Validated at load time by
// @deepseek-ai/dsh-typert-loader's validateTypertManifest.
//
//   package     must equal this package's own `name` field
//   face        must be "host"
//   invocations one entry per @Remote method
//   model       services/events/objects are optional and may be empty

import { z } from 'zod';

/** Nullable string, matching the generator's literal-union style. */
const nullableString = z.union([z.literal(null), z.string()]);

/** Mirrors the row shape returned by lib/scan.js. */
const skillSchema = z.object({
  name: z.string(),
  version: nullableString,
  description: nullableString,
  summary: nullableString,
  path: z.string(),
  dir: z.string(),
  root: z.string(),
  rootDisplay: z.string(),
  repo: nullableString,
  ref: nullableString,
  localSha: nullableString,
  syncedAt: nullableString,
  remoteSha: nullableString,
  status: z.union([
    z.literal('behind'),
    z.literal('unknown'),
    z.literal('up_to_date'),
    z.literal('unmanaged'),
  ]),
  detail: nullableString,
});

/** One scanned root and how many skills it contributed after de-duplication. */
const rootSchema = z.object({
  root: z.string(),
  display: z.string(),
  short: z.string(),
  status: z.union([z.literal('ok'), z.literal('absent'), z.literal('unreadable')]),
  found: z.number(),
  counted: z.number(),
});

const listResultSchema = z.object({
  skills: z.array(skillSchema),
  roots: z.array(rootSchema),
  summary: z.object({
    total: z.number(),
    managed: z.number(),
    unmanaged: z.number(),
    behind: z.number(),
    upToDate: z.number(),
    unknown: z.number(),
  }),
  note: nullableString,
  polledAt: z.string(),
});

export const TYPERT = {
  package: '@lzsusc2019/skills-watch',
  face: 'host',
  schemas: [],
  invocations: [
    {
      id: '@lzsusc2019/skills-watch#skillsWatch/list',
      service: 'skillsWatch',
      namespace: 'skillsWatch',
      method: 'list',
      invocation: { kind: 'direct' },
      parameters: [],
      result: {
        mode: 'strict',
        typeSymbol: '@lzsusc2019/skills-watch/types#SkillsWatchSnapshot',
        schema: listResultSchema,
      },
      sourceLocation: { file: 'lib/index.js', line: 84, column: 3 },
    },
  ],
  model: {
    services: [],
    events: [],
    objects: [],
  },
};

export default TYPERT;
