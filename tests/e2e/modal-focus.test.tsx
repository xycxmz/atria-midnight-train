import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ModalShell } from '../../src/components/Modals';

describe('submission modal keyboard boundary', () => {
  it('focuses inside, traps Tab and restores the opener', () => {
    const opener = document.createElement('button'); document.body.append(opener); opener.focus();
    const close = vi.fn();
    const { unmount } = render(<ModalShell title="帮助" ariaLabel="测试帮助" onClose={close}><input aria-label="输入" /></ModalShell>);
    const button = screen.getByRole('button', { name: '关闭（Esc）' });
    const input = screen.getByLabelText('输入');
    expect(document.activeElement).toBe(button);
    fireEvent.keyDown(button, { key: 'Tab' }); expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(button);
    fireEvent.keyDown(input, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
    unmount(); expect(document.activeElement).toBe(opener); opener.remove(); cleanup();
  });
});
