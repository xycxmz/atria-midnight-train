import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// jsdom 没有 DragEvent/DataTransfer，用垫片对象让 React 的 DnD 处理器读到 dataTransfer。
interface ShimTransfer {
  store: Record<string, string>;
  effectAllowed: string;
  dropEffect: string;
  setData: (key: string, value: string) => void;
  getData: (key: string) => string;
}
const makeShim = (): ShimTransfer => ({
  store: {},
  effectAllowed: 'move',
  dropEffect: 'move',
  setData(key, value) {
    this.store[key] = value;
  },
  getData(key) {
    return this.store[key] ?? '';
  },
});
const fireDnd = (element: Element, type: string, shim: ShimTransfer) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  (event as unknown as { dataTransfer: ShimTransfer }).dataTransfer = shim;
  element.dispatchEvent(event);
};
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/app/App';

// 桌面树为主查询范围；移动端副本（.mobile-pane）默认隐藏，避免重复命中。
const desktop = () => document.querySelector('.main-grid') as HTMLElement;
const deskText = (text: string) =>
  [...desktop().querySelectorAll('button')].find((button) => button.textContent?.trim().includes(text));

const clickText = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const target = deskText(text) ?? screen.getByRole('button', { name: new RegExp(text) });
  expect(target, `找不到按钮：${text}`).toBeTruthy();
  await user.click(target as HTMLElement);
};

const clockNow = () => desktop().querySelector('.tl-clock')?.textContent?.trim();

describe('浏览器闭环：从新调查到结案', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('前 60 秒核心流程：调查、收卡、放置、对照 45 秒不足', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    // 教程第一条指向 S 会客车桌面
    expect(screen.getByText(/S 会客车的“桌面”/)).toBeInTheDocument();

    // 调查桌面，收下 E01 与 E04
    await clickText(user, '桌面');
    const readButtons = screen.getAllByRole('button', { name: '查看并收下记录' });
    for (const button of readButtons) {
      await user.click(button);
    }
    expect(desktop().textContent).toContain('委托与封存单');
    expect(desktop().textContent).toContain('林澈的电报回执');

    // 询问苏砚，得到证词 E09
    await user.click(deskText('询问') as HTMLElement);
    await user.click(
      [...desktop().querySelectorAll('.person-row')].find((row) => row.textContent?.includes('苏砚')) as HTMLElement,
    );
    await user.click(desktop().querySelector('.topic-btn') as HTMLElement);
    expect(desktop().textContent).toContain('已收下证词卡 E09');

    // 把 E04 放入林澈轨道（选择卡片、选择轨道、确认放置 的点击路径）
    const e04Item = [...desktop().querySelectorAll('.clue-item')].find((item) =>
      item.textContent?.includes('E04'),
    ) as HTMLElement;
    await user.click(e04Item.querySelector('.clue-item-top') as HTMLElement);
    await user.click(within(desktop()).getByRole('button', { name: /放入时间轴/ }));
    const confirm = within(desktop())
      .getAllByRole('button')
      .find((button) => button.textContent?.includes('放到 林澈')) as HTMLElement;
    await user.click(confirm);
    const laneCards = desktop().querySelectorAll('.tl-card');
    expect(laneCards.length).toBe(1);
    expect(laneCards[0].textContent).toContain('23:58:15');

    // 选中 E09 对照：应得到 75/30/45 的不足结论
    const e09Item = [...desktop().querySelectorAll('.clue-item')].find((item) =>
      item.textContent?.includes('E09'),
    ) as HTMLElement;
    await user.click([...e09Item.querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);
    const cmp = desktop().querySelector('.cmp-verdict');
    expect(cmp?.textContent).toContain('缺少 45 秒');
    expect(desktop().querySelector('.cmp-rows')?.textContent).toContain('75 秒');
    expect(cmp?.textContent).toContain('不能同时成立');
    // 对照面板不指认嫌疑人
    expect(cmp?.textContent).not.toContain('作案');
  });

  it('最小发现集：历史对照不显示未知位置、不插值', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    await clickText(user, '桌面');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(deskText('询问') as HTMLElement);
    await user.click(
      [...desktop().querySelectorAll('.person-row')].find((row) => row.textContent?.includes('苏砚')) as HTMLElement,
    );
    await user.click(desktop().querySelector('.topic-btn') as HTMLElement);

    // 此时仅有 E01/E04/E09：历史对照还没有苏砚的任何客观记录
    await user.click(within(desktop()).getByRole('button', { name: '历史对照' }));
    const unknowns = () => [...desktop().querySelectorAll('.unknown-chip')].map((m) => m.textContent ?? '');
    expect(unknowns().some((text) => text.includes('苏砚'))).toBe(true);

    // 游标到 E09 的第二处证词时刻，只显示标为证词的标记
    const forward = within(desktop()).getByRole('button', { name: '游标前进 15 秒' });
    for (let step = 0; step < 16; step += 1) {
      await user.click(forward);
    }
    expect(clockNow()).toBe('00:00:00');
    const markers = [...desktop().querySelectorAll('.person-marker')].map((m) => m.textContent);
    expect(markers.some((text) => text?.includes('证词') && text.includes('D 车'))).toBe(true);
    expect(desktop().textContent).not.toContain('从餐车外壁检修格内取出');
  });

  it('刷新后恢复进度，线索与布置不丢失', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));
    await clickText(user, '桌面');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    const e04Item = [...desktop().querySelectorAll('.clue-item')].find((item) =>
      item.textContent?.includes('E04'),
    ) as HTMLElement;
    await user.click(e04Item.querySelector('.clue-item-top') as HTMLElement);
    await user.click(within(desktop()).getByRole('button', { name: /放入时间轴/ }));
    await user.click(
      within(desktop())
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('放到 林澈')) as HTMLElement,
    );

    expect(window.localStorage.getItem('midnight-train.save.v1')).toBeTruthy();
    unmount();

    render(<App />);
    await user.click(screen.getByRole('button', { name: '继续调查' }));
    expect(desktop().querySelectorAll('.clue-item').length).toBeGreaterThanOrEqual(2);
    expect(desktop().querySelectorAll('.tl-card').length).toBe(1);
    expect(desktop().textContent).toContain('林澈的电报回执');
  });

  it('拖放与点击路径等效，Escape 取消放置不丢卡', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    // 收集 E04
    await clickText(user, '桌面');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));

    // 拖放路径：从线索列表把 E04 拖到苏砚轨道
    const source = [...desktop().querySelectorAll('.clue-item')].find((item) =>
      item.textContent?.includes('E04'),
    ) as HTMLElement;
    const lane = [...desktop().querySelectorAll('.tl-lane')].find((laneEl) =>
      laneEl.textContent?.includes('苏砚'),
    ) as HTMLElement;
    const shim = makeShim();
    fireDnd(source, 'dragstart', shim);
    fireDnd(lane, 'dragover', shim);
    fireDnd(lane, 'drop', shim);
    await act(async () => {});
    const cards = desktop().querySelectorAll('.tl-card');
    expect(cards.length).toBe(1);
    expect(cards[0].textContent).toContain('23:58:15');
    expect((window as unknown as { __train_debug__?: { placements: Array<{ lane: string }> } }).__train_debug__?.placements[0]?.lane).toBe('su');

    // Escape 取消放置：卡片不丢失
    await user.click([...source.querySelectorAll('button')].find((b) => b.textContent === '详情') as HTMLElement);
    await user.click(within(desktop()).getByRole('button', { name: /放入时间轴|更换轨道/ }));
    expect(desktop().querySelectorAll('.tl-drop-confirm').length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');
    expect(desktop().querySelectorAll('.tl-drop-confirm').length).toBe(0);
    expect(desktop().querySelectorAll('.tl-card').length).toBe(1);
    expect(desktop().querySelectorAll('.clue-item').length).toBeGreaterThanOrEqual(1);
  });

  it('移动端三页签切换不丢状态', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    const tabs = document.querySelector('.mobile-tabs') as HTMLElement;
    const tabOf = (name: string) =>
      [...tabs.querySelectorAll('button')].find((button) => button.textContent?.trim() === name) as HTMLElement;

    // 线索 → 地图 → 时间轴：每页内容渲染且其他页隐藏
    await user.click(tabOf('地图'));
    expect(document.querySelector('.mobile-pane')?.textContent).toContain('S 车');
    await user.click(tabOf('时间轴'));
    expect(document.querySelector('.mobile-pane')?.textContent).toContain('时间轴');
    await user.click(tabOf('线索'));
    expect(document.querySelector('.mobile-pane')?.textContent).toContain('线索（0/12）');
    // 桌面树仍然保留状态
    expect(desktop().querySelector('.tl-clock')).toBeTruthy();
  });

  it('动画偏好关闭后根节点带 no-motion 类', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '设置 / 存档' }));
    const motionCheckbox = screen.getAllByRole('checkbox')[1];
    await user.click(motionCheckbox);
    expect(document.querySelector('.app')?.classList.contains('no-motion')).toBe(true);
  });

  it('跨人物记录不产生假矛盾（TR-001）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    // 收集 E04（桌面）与 E05（服务台）
    await clickText(user, '桌面');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));
    await clickText(user, '服务台');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));

    const pickItem = (text: string) =>
      [...desktop().querySelectorAll('.clue-item')].find((item) => item.textContent?.includes(text)) as HTMLElement;
    await user.click([...pickItem('E04').querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);
    await user.click([...pickItem('E05').querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);

    // 默认比较不能给出假矛盾
    const defaultVerdict = desktop().querySelector('.cmp-verdict')?.textContent ?? '';
    expect(defaultVerdict).not.toContain('不能同时成立');
    expect(desktop().textContent).toContain('多位人物');

    // 显式选择跨人物两端：得到“主体不同”而非矛盾判词
    const selects = desktop().querySelectorAll('.cmp-endpoints select');
    await user.selectOptions(selects[0], '林澈 · 记录 · S 会客车 · 23:58:15');
    await user.selectOptions(selects[1], '周岚 · 记录 · D 餐车 · 23:58:15');
    const crossVerdict = desktop().querySelector('.cmp-verdict')?.textContent ?? '';
    expect(crossVerdict).toContain('主体不同');
    expect(crossVerdict).not.toContain('缺少');
    // 周岚自己的两张服务单（同地）可以做同主体比较且相容
    await user.selectOptions(selects[0], '周岚 · 记录 · D 餐车 · 23:58:15');
    await user.selectOptions(selects[1], '周岚 · 记录 · D 餐车 · 23:58:45');
    const sameVerdict = desktop().querySelector('.cmp-verdict')?.textContent ?? '';
    expect(sameVerdict).toContain('可以同时成立');
  });

  it('人物记录可对已确定事件做排除对照（TR-010）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    await clickText(user, '桌面');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));
    await clickText(user, '展匣');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));

    const pickItem = (text: string) =>
      [...desktop().querySelectorAll('.clue-item')].find((item) => item.textContent?.includes(text)) as HTMLElement;
    await user.click([...pickItem('E04').querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);
    await user.click([...pickItem('E07').querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);

    const verdict = desktop().querySelector('.cmp-verdict')?.textContent ?? '';
    expect(verdict).toContain('不相容');
    expect(verdict).toContain('15 秒');
    expect(verdict).toContain('150 秒');
    // 对照结论钉为推理笔记：含计算结论而非仅标题
    await user.click(within(desktop()).getByRole('button', { name: '钉为推理笔记' }));
    const noteText = desktop().textContent ?? '';
    expect(noteText).toContain('推理笔记');
    expect(noteText).toContain('不相容');
    expect(noteText).toContain('150 秒');

    // 恢复对照：把两张证据放回选择
    await user.click(within(desktop()).getByRole('button', { name: '恢复对照' }));
    expect((window as unknown as { __train_debug__?: { selection: string[] } }).__train_debug__?.selection).toEqual(['E04', 'E07']);
  });

  it('结案草稿切页与刷新后保持（TR-006）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    await user.click(deskText('结案') as HTMLElement);
    await user.selectOptions(within(desktop()).getByLabelText('取走物件的人物'), 'lin');
    await user.selectOptions(within(desktop()).getByLabelText('取走地点'), 'L');
    await user.type(within(desktop()).getByLabelText(/取走时刻/), '23:58:30');
    await user.selectOptions(within(desktop()).getByLabelText('藏匿地点'), '行李车展匣夹层');

    // 切到询问页再回来：字段不丢
    await user.click(within(desktop()).getByRole('tab', { name: '询问' }));
    await user.click(within(desktop()).getByRole('tab', { name: '结案' }));
    expect((document.getElementById('vd-person') as HTMLSelectElement).value).toBe('lin');
    expect((document.getElementById('vd-location') as HTMLSelectElement).value).toBe('L');
    expect((document.getElementById('vd-time') as HTMLInputElement).value).toBe('23:58:30');

    // 草稿随存档保存：卸载重挂后仍在
    const saved = window.localStorage.getItem('midnight-train.save.v1') ?? '';
    expect(saved).toContain('"person":"lin"');
    expect(saved).toContain('"timeLabel":"23:58:30"');
  });

  it('精确时刻输入与声称刻度定位（TR-009）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    // 定位 00:00:12（t=252，非 15 秒整步进可达）
    const input = within(desktop()).getByLabelText('定位时刻');
    await user.type(input, '00:00:12');
    await user.click(within(desktop()).getByRole('button', { name: '定位' }));
    expect(clockNow()).toBe('00:00:12');

    // 非法输入给出错误而不变成 0
    await user.clear(input);
    await user.type(input, '99:99:99');
    await user.click(within(desktop()).getByRole('button', { name: '定位' }));
    expect(clockNow()).toBe('00:00:12');

    // 放上 E04 后，点击其声称刻度可定位
    await clickText(user, '桌面');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));
    const e04Item = [...desktop().querySelectorAll('.clue-item')].find((item) =>
      item.textContent?.includes('E04'),
    ) as HTMLElement;
    await user.click(e04Item.querySelector('.clue-item-top') as HTMLElement);
    await user.click(within(desktop()).getByRole('button', { name: /放入时间轴/ }));
    await user.click(
      within(desktop())
        .getAllByRole('button')
        .find((button) => button.textContent?.includes('放到 林澈')) as HTMLElement,
    );
    const tick = desktop().querySelector('.tl-claim') as HTMLElement;
    await user.click(tick);
    expect(clockNow()).toBe('23:58:15');
  });

  it('时间游标可用键盘方向键移动', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));
    expect(clockNow()).toBe('23:56:00');
    const handle = desktop().querySelector('.tl-cursor-handle') as HTMLElement;
    handle.focus();
    await user.keyboard('{ArrowRight}');
    expect(clockNow()).toBe('23:56:15');
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(clockNow()).toBe('23:56:00');
    await user.keyboard('{End}');
    expect(clockNow()).toBe('00:02:00');
  });

  it('完整案件：错误人名不泄露、正确证据链结案成功', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    // 收集全部热点证据
    for (let round = 0; round < 4; round += 1) {
      const hotspots = [...desktop().querySelectorAll('.hotspot-btn')].filter(
        (button) => !button.classList.contains('done'),
      );
      if (hotspots.length === 0) break;
      for (const hotspot of hotspots) {
        await user.click(hotspot);
        // 同一证据被多个热点共享（如通行表 E03），已收下时只剩“查看原文”
        for (const button of screen.queryAllByRole('button', { name: '查看并收下记录' })) {
          await user.click(button);
        }
        await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));
      }
    }
    // 两位证人的证词
    await user.click(deskText('询问') as HTMLElement);
    await user.click(
      [...desktop().querySelectorAll('.person-row')].find((row) => row.textContent?.includes('周岚')) as HTMLElement,
    );
    await user.click(desktop().querySelector('.topic-btn') as HTMLElement);
    await user.click(
      [...desktop().querySelectorAll('.person-row')].find((row) => row.textContent?.includes('苏砚')) as HTMLElement,
    );
    await user.click(desktop().querySelector('.topic-btn') as HTMLElement);

    const discovered = (window as unknown as { __train_debug__?: { discovered: string[] } }).__train_debug__?.discovered;
    expect(discovered?.length).toBe(12);

    // 错误人名 + 全证据：失败且不泄露
    await user.click(deskText('结案') as HTMLElement);
    await user.selectOptions(within(desktop()).getByLabelText('取走物件的人物'), 'lin');
    await user.selectOptions(within(desktop()).getByLabelText('取走地点'), 'L');
    await user.type(within(desktop()).getByLabelText(/取走时刻/), '23:58:30');
    await user.selectOptions(within(desktop()).getByLabelText('物件'), '黄铜星图盘');
    await user.selectOptions(within(desktop()).getByLabelText('藏匿地点'), '餐车外壁检修格');
    const chips = within(desktop()).getAllByRole('button', { name: /^E\d{2} ·/ });
    for (const chip of chips) {
      if (chip.getAttribute('aria-pressed') === 'false') await user.click(chip);
    }
    await user.click(within(desktop()).getByRole('button', { name: '提交结案' }));

    const feedback = desktop().textContent ?? '';
    expect(feedback).toContain('不相容');
    expect(feedback).not.toContain('苏砚才是');
    expect(desktop().textContent).toContain('提交被退回');
    // 调查不被重置
    expect(desktop().querySelectorAll('.clue-item').length).toBeGreaterThan(0);

    // 正确结案
    await user.selectOptions(within(desktop()).getByLabelText('取走物件的人物'), 'su');
    await user.click(within(desktop()).getByRole('button', { name: '提交结案' }));
    expect(document.querySelector('.ending-card')).toBeTruthy();
    expect(document.querySelector('.ending-card')?.textContent).toContain('是我拿的');
    expect(document.querySelectorAll('.ending-card .timeline-table tbody tr').length).toBe(15);
    // 试玩指标出现在回顾页
    const endingText = document.querySelector('.ending-card')?.textContent ?? '';
    expect(endingText).toContain('首次有效操作');
    expect(endingText).toContain('结案尝试');
    expect(endingText).toContain('询问次数');
  }, 30000);

  it('对照端点不随无关操作重置（TR2-003）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    await clickText(user, '桌面');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));
    await clickText(user, '服务台');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));

    const pickItem = (text: string) =>
      [...desktop().querySelectorAll('.clue-item')].find((item) => item.textContent?.includes(text)) as HTMLElement;
    await user.click([...pickItem('E04').querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);
    await user.click([...pickItem('E05').querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);

    // 手选跨人物两端
    const selects = () => desktop().querySelectorAll('.cmp-endpoints select');
    await user.selectOptions(selects()[0], '林澈 · 记录 · S 会客车 · 23:58:15');
    await user.selectOptions(selects()[1], '周岚 · 记录 · D 餐车 · 23:58:15');
    expect(desktop().querySelector('.cmp-verdict')?.textContent ?? '').toContain('主体不同');

    // 移动时间游标、切换地图模式：端点键保持
    const forward = within(desktop()).getByRole('button', { name: '游标前进 15 秒' });
    await user.click(forward);
    await user.click(within(desktop()).getByRole('button', { name: '历史对照' }));
    await user.click(within(desktop()).getByRole('button', { name: '调查视图' }));
    expect((selects()[0] as HTMLSelectElement).value).toBe('lin|S|135|E04 林澈的电报回执');
    expect((selects()[1] as HTMLSelectElement).value).toBe('zhou|D|135|E05 周岚的连号服务单');
    expect(desktop().querySelector('.cmp-verdict')?.textContent ?? '').toContain('主体不同');

    // 对照最多两张卡：加入 E01 会把最早的 E04 移出选择，其端点失效时回退默认并重算
    await user.click([...pickItem('E01').querySelectorAll('button')].find((b) => b.textContent === '对照') as HTMLElement);
    const afterAddPanel = desktop().querySelector('.cmp-panel')?.textContent ?? '';
    expect(afterAddPanel).toContain('周岚');
    expect(afterAddPanel).not.toContain('主体不同');
  });

  it('仅发现 E07 时玩家元数据不泄露作者答案（TR-002）', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '开始新调查' }));
    await user.click(screen.getByRole('button', { name: '进入列车' }));

    await clickText(user, '展匣');
    for (const button of screen.getAllByRole('button', { name: '查看并收下记录' })) {
      await user.click(button);
    }
    await user.click(screen.getByRole('button', { name: /^关闭（Esc）/ }));

    const e07Item = [...desktop().querySelectorAll('.clue-item')].find((item) =>
      item.textContent?.includes('E07'),
    ) as HTMLElement;
    await user.click(e07Item.querySelector('.clue-item-top') as HTMLElement);
    const card = desktop().querySelector('.ev-card')?.textContent ?? '';
    expect(card).not.toContain('苏');
    expect(card).toContain('记录未指明');
  });
});