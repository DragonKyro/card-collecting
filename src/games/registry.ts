// The shell discovers games by importing this registry. To add a new game:
//   1. Create src/games/<id>/ with module.ts exporting a GameModule
//   2. Add it below
// No code outside the new folder needs to change.

import type { AnyGameModule } from '@/core/module';
import { sushiGoModule } from './sushi-go/module';
import { seaSaltPaperModule } from './sea-salt-paper/module';
import { sevenWondersModule } from './seven-wonders/module';

export const GAMES: AnyGameModule[] = [
  sushiGoModule as unknown as AnyGameModule,
  seaSaltPaperModule as unknown as AnyGameModule,
  sevenWondersModule as unknown as AnyGameModule,
];

export function getGameById(id: string): AnyGameModule | undefined {
  return GAMES.find((g) => g.id === id);
}
