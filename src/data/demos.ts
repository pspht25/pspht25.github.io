export interface DemoCard {
  /** URL 路径段：/demos/<slug>/ */
  slug: string;
  title: string;
  description: string;
  emoji: string;
  /** public/demos/ 下的页面入口：单文件演示是 .html 文件名，目录型演示放 files/<dir>/index.html
   *  （目录不能直接叫 <slug>/：Astro 详情页路由产物 dist/demos/<slug>/index.html 会覆盖 public 同名文件，导致 iframe 自嵌套） */
  file: string;
  /** 目录型演示可选：public/demos/files/ 下的 zip 导出包路径；有值时详情页下载按钮改为导出 zip */
  zip?: string;
  tags: string[];
  /** false 时在演示集中显示为灰色待建卡片 */
  ready: boolean;
}

// 演示注册表：新增演示 = 新建 public/demos/<file>（单文件 html 或目录型页面）+ 在这里加一行
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
  {
    slug: 'gray-snr-lab',
    title: '环形灰阶卡：SNR 是怎么测出来的',
    description: 'Imatest 式相机 IQ 测量演绎：合成灰阶照片、抓取 patch、画 OECF、算 SNR 与那个 0.13、多帧分离两种噪声、外推动态范围，附 py2js 全流水线实操',
    emoji: '🎯',
    file: 'files/gray-snr-lab/index.html',
    zip: 'files/gray-snr-lab.zip',
    tags: ['ISP', '相机IQ', 'Imatest', '科普'],
    ready: true,
  },
];
