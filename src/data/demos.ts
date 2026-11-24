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
  {
    slug: 'sfr-slant-edge',
    title: '斜边法：MTF 是怎么量出来的',
    description: 'SFR 斜边法四步演绎：边缘定位、ESF 过采样、LSF 差分与频率打分，看懂一张斜边照片如何变成镜头锐度曲线',
    emoji: '📐',
    file: 'sfr-slant-edge.html',
    tags: ['ISP', 'MTF', '科普'],
    ready: true,
  },
  {
    slug: 'bilateral-lab',
    title: '双边滤波：既平滑又保边',
    description: '经典算法演绎：两个高斯核的乘法如何炼成保边平滑，权重放大镜拆开中间计算，逐像素动画看滤波窗口工作，兼讲 1998 年诞生到 HDRNet 的三十年',
    emoji: '🎨',
    file: 'bilateral-lab.html',
    tags: ['ISP', '图像处理', '科普'],
    ready: true,
  },
];
