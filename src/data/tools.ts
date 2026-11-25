export interface ToolCard {
  title: string;
  description: string;
  path: string;
  emoji: string;
  /** false 时在工具箱中显示为灰色待建卡片 */
  ready: boolean;
}

// 工具注册表：新增工具 = 新建 src/pages/tools/<name>.astro + 在这里加一行
export const tools: ToolCard[] = [
  {
    title: '计算器',
    description: '支持四则运算、括号、百分号与键盘输入的网页计算器',
    path: '/tools/calculator/',
    emoji: '🧮',
    ready: true,
  },
  {
    title: 'Python → JS 转译器',
    description: '把 Python 风格代码实时转译为原生 JavaScript：毫秒级静态转译，产物由 V8 直接执行，可复制到任何 JS 项目',
    path: '/tools/py2js/',
    emoji: '🔁',
    ready: true,
  },
  {
    title: 'Python IDE',
    description: 'IDE 风格的本地编辑器：打开本地文件夹作工作目录（纯本地、不上云、缓存可清除），多标签语法高亮，py2js 毫秒级转译执行',
    path: '/tools/py-ide/',
    emoji: '🗂️',
    ready: true,
  },
  {
    title: '正则测试器',
    description: '实时匹配高亮与分组捕获',
    path: '/tools/regex/',
    emoji: '🔍',
    ready: false,
  },
  {
    title: '时间戳转换',
    description: 'Unix 时间戳与日期互转',
    path: '/tools/timestamp/',
    emoji: '⏱️',
    ready: false,
  },
  {
    title: '二维码生成',
    description: '文本 / 链接转二维码图片',
    path: '/tools/qrcode/',
    emoji: '🧩',
    ready: false,
  },
];
