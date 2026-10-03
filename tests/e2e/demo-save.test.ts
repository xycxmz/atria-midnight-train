import { describe, expect, it } from 'vitest';
import demoSave from '../../demo/demo-save.json';
import { importSave } from '../../src/storage/save';

describe('预制演示存档', () => {
  it('能通过导入校验（演示用，正常新游戏不会读入它）', () => {
    const outcome = importSave(JSON.stringify(demoSave));
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.state.discovered).toContain('E09');
      expect(outcome.state.discovered).not.toContain('E12');
      expect(outcome.state.selection).toEqual(['E09']);
      expect(outcome.state.placements).toHaveLength(2);
      expect(outcome.state.phase).toBe('investigating');
    }
  });
});
