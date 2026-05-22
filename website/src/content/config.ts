import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineCollection, z } from 'astro:content';

const releases = defineCollection({
  type: 'content',
  schema: z.object({
    version: z.string(),
    date: z.coerce.date(),
    additions: z.array(z.string()),
    fixes: z.array(z.string()),
  }),
});

const roadmapItemSchema = z.object({
  appArea: z.string(),
  difficulty: z.string(),
  featureName: z.string(),
  priority: z.string(),
  status: z.enum(['Finished', 'To-Do']),
});

const roadmap = defineCollection({
  loader: async () => {
    const path = fileURLToPath(new URL('./roadmap.json', import.meta.url));
    const items = JSON.parse(readFileSync(path, 'utf-8')) as z.infer<typeof roadmapItemSchema>[];
    return items.map((item, index) => ({
      id: `roadmap-${index}`,
      ...item,
    }));
  },
  schema: roadmapItemSchema,
});

export const collections = { releases, roadmap };
