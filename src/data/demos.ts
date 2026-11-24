export interface DemoCard {
  /** URL 路径段：/demos/<slug>/ */
  slug: string;
  title: string;
  description: string;
  emoji: string;
  /** public/demos/ 下的单文件名（自包含 HTML，可整页下载） */
  file: string;
  tags: string[];
  /** false 时在演示集中显示为灰色待建卡片 */
  ready: boolean;
}

// 演示注册表：新增演示 = 新建 public/demos/<file>.html + 在这里加一行
export const demos: DemoCard[] = [
  {
    slug: 'noise-lab',
    title: '噪声是怎样炼成的',
    description: 'ISP 图像降噪演绎：传感器噪声的物理来源、SNR 的对数世界、经典滤波与 AI ISP 前沿全景',
    emoji: '📷',
    file: 'noise-lab.html',
    tags: ['ISP', '图像处理', '科普'],
    ready: true,
  },
];
