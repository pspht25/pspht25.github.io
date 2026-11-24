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
    title: 'Python 解释器',
    description: '浏览器里的真 CPython（Pyodide），由博客自托管引擎，支持 numpy / scipy / pandas / matplotlib / sympy，代码全部在本地运行',
    path: '/tools/python-runner/',
    emoji: '🐍',
    ready: true,
  },
  {
    title: 'Python 笔记本',
    description: '类 Jupyter 的科学计算笔记本：单元格制、变量跨格共享、Out[n] 显示表达式结果、matplotlib 内联，支持顶层 await',
    path: '/tools/python-notebook/',
    emoji: '🧪',
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
